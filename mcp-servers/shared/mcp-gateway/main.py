"""Zero-Trust HTTP/HTTPS API Gateway for MCP (Model Context Protocol).

Provides a centralized HTTP SSE / REST API proxy gateway enforcing edge
authentication, tool authorization, and path resolution via permission_engine
before forwarding payloads to internal MCP container servers.
"""

from __future__ import annotations

import json

import httpx
from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from auth import extract_credentials, verify_and_enforce
from config import CONTAINER_TARGETS, logger
from webhooks import notify_security_event

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(title="Zero-Trust MCP API Gateway", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Target resolution
# ---------------------------------------------------------------------------
async def resolve_target_base(server_name: str) -> str:
    """Find a reachable backend URL for *server_name*, falling back to the
    last candidate if none respond."""
    targets = (
        CONTAINER_TARGETS.get(server_name)
        or CONTAINER_TARGETS.get(f"{server_name}-mcp")
        or [f"http://{server_name}:8000"]
    )
    if isinstance(targets, str):
        targets = [targets]

    for target in targets:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                await client.get(target)
                logger.debug("Target resolved: %s → %s", server_name, target)
                return target
        except Exception:
            logger.debug("Target unreachable: %s", target)
            continue
    logger.warning(
        "All targets unreachable for %s, using %s as fallback",
        server_name,
        targets[0],
    )
    return targets[0]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok", "gateway": "zero-trust-mcp"}


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every incoming request with method, path, and client info."""
    from config import logger

    logger.info(
        "%s %s from %s",
        request.method,
        request.url.path,
        request.client.host if request.client else "unknown",
    )
    response = await call_next(request)
    if response.status_code >= 400:
        logger.warning(
            "%s %s → %d",
            request.method,
            request.url.path,
            response.status_code,
        )
    return response


@app.api_route("/mcp/{server_name}/sse", methods=["GET", "POST"])
async def handle_sse(
    server_name: str,
    request: Request,
    authorization: str | None = Header(None),
    x_mcp_user_id: str | None = Header(None, alias="X-MCP-User-ID"),
):
    user_id, user_key = extract_credentials(
        authorization, x_mcp_user_id, request
    )
    verify_and_enforce(server_name, user_id, user_key, request=request)
    logger.info("SSE handshake: server=%s user=%s", server_name, user_id)

    target_base = await resolve_target_base(server_name)
    if not target_base:
        notify_security_event(
            event="unknown_server",
            request=request,
            http_status=status.HTTP_404_NOT_FOUND,
            server_name=server_name,
            user_id=user_id,
            error_type="UnknownServer",
            error_reason=f"Unknown MCP server '{server_name}'",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP server '{server_name}'",
        )

    url = f"{target_base}/sse"
    client = httpx.AsyncClient(timeout=None)
    filtered_headers = [
        (k, v) for k, v in request.headers.raw if k.lower() != b"host"
    ]
    try:
        req = client.build_request(
            request.method,
            url,
            headers=filtered_headers,
            content=request.stream(),
        )
        res = await client.send(req, stream=True)

        async def sse_stream():
            try:
                async for line in res.aiter_lines():
                    if line.startswith("data: /messages"):
                        line = f"data: /mcp/{server_name}" + line[6:]
                    elif line.startswith("data: messages"):
                        line = f"data: /mcp/{server_name}/" + line[6:]
                    yield (line + "\n").encode("utf-8")
            finally:
                await res.aclose()
                await client.aclose()

        response_headers = dict(res.headers)
        response_headers.pop("content-length", None)
        response_headers.pop("transfer-encoding", None)

        return StreamingResponse(
            sse_stream(),
            status_code=res.status_code,
            headers=response_headers,
        )
    except Exception as e:
        logger.error("Error proxying SSE to target %s: %s", url, e)
        notify_security_event(
            event="bad_gateway",
            request=request,
            http_status=status.HTTP_502_BAD_GATEWAY,
            server_name=server_name,
            user_id=user_id,
            error_type="BadGateway",
            error_reason=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to target server '{server_name}' at {url}: {e}",
        )


@app.post("/mcp/{server_name}/messages")
async def handle_messages(
    server_name: str,
    request: Request,
    authorization: str | None = Header(None),
    x_mcp_user_id: str | None = Header(None, alias="X-MCP-User-ID"),
):
    user_id, user_key = extract_credentials(
        authorization, x_mcp_user_id, request
    )
    body_bytes = await request.body()
    tool_name = None
    tool_args = None

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
        if payload.get("method") == "tools/call":
            params = payload.get("params", {})
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})
            logger.debug(
                "Tool call: server=%s user=%s tool=%s args=%s",
                server_name,
                user_id,
                tool_name,
                json.dumps(tool_args, default=str)[:200] if tool_args else "{}",
            )
    except Exception:
        pass

    verify_and_enforce(
        server_name,
        user_id,
        user_key,
        tool_name=tool_name,
        tool_args=tool_args,
        request=request,
    )

    target_base = await resolve_target_base(server_name)
    if not target_base:
        notify_security_event(
            event="unknown_server",
            request=request,
            http_status=status.HTTP_404_NOT_FOUND,
            server_name=server_name,
            user_id=user_id,
            error_type="UnknownServer",
            error_reason=f"Unknown MCP server '{server_name}'",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP server '{server_name}'",
        )

    headers = dict(request.headers)
    headers.pop("host", None)
    headers["X-MCP-User-ID"] = user_id
    headers["X-MCP-User-Key"] = user_key

    url = f"{target_base}/messages"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                url,
                content=body_bytes,
                headers=headers,
                params=request.query_params,
            )
            return Response(
                content=res.content,
                status_code=res.status_code,
                headers=dict(res.headers),
            )
    except Exception as e:
        logger.error("Error proxying messages to target %s: %s", url, e)
        notify_security_event(
            event="bad_gateway",
            request=request,
            http_status=status.HTTP_502_BAD_GATEWAY,
            server_name=server_name,
            user_id=user_id,
            error_type="BadGateway",
            error_reason=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to post message to target server '{server_name}' at {url}: {e}",
        )
