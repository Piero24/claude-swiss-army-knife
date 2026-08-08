"""Zero-Trust HTTP/HTTPS API Gateway for MCP (Model Context Protocol).

Provides a centralized HTTP SSE / REST API proxy gateway enforcing edge authentication,
tool authorization, and path resolution via permission_engine before forwarding
payloads to internal MCP container servers.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from permission_engine import ForbiddenError, PermissionEnforcer
from permission_engine.users import AuthenticationError, load_users, validate_user

CONTAINER_TARGETS = {
    "ubuntu-server": [
        "http://ubuntu-mcp:8000",
        "http://ubuntu-server:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "ubuntu-mcp": [
        "http://ubuntu-mcp:8000",
        "http://ubuntu-server:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "obsidian": [
        "http://obsidian-mcp:8000",
        "http://obsidian:8000",
    ],
    "obsidian-mcp": [
        "http://obsidian-mcp:8000",
        "http://obsidian:8000",
    ],
    "synology-nas": [
        "http://synology-mcp:8000",
        "http://synology-nas:8000",
    ],
    "synology-mcp": [
        "http://synology-mcp:8000",
        "http://synology-nas:8000",
    ],
    "github": [
        "http://github-mcp:8000",
        "http://github:8000",
    ],
    "github-mcp": [
        "http://github-mcp:8000",
        "http://github:8000",
    ],
    "link-manager": [
        "http://link-manager-mcp:8000",
        "http://link-manager:8000",
    ],
    "link-manager-mcp": [
        "http://link-manager-mcp:8000",
        "http://link-manager:8000",
    ],
}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp-gateway")

app = FastAPI(title="Zero-Trust MCP API Gateway", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIGS_DIR = Path(os.environ.get("CONFIGS_PATH", "/app/configs"))
USERS_FILE = CONFIGS_DIR / "users.yaml"


async def _resolve_target_base(server_name: str) -> str:
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
                return target
        except Exception:
            continue
    return targets[0]


def _extract_credentials(
    authorization: str | None, x_mcp_user_id: str | None
) -> tuple[str, str]:
    user_id = x_mcp_user_id or ""
    user_key = ""
    if authorization and authorization.startswith("Bearer "):
        user_key = authorization[7:].strip()

    if not user_id or not user_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer token or X-MCP-User-ID header",
        )
    return user_id, user_key


def _verify_and_enforce(
    server_name: str,
    user_id: str,
    user_key: str,
    tool_name: str | None = None,
    tool_args: dict[str, Any] | None = None,
):
    users = load_users(str(USERS_FILE))
    try:
        validate_user(users, user_id, user_key)
    except AuthenticationError as e:
        logger.warning("Auth failed for user=%s: %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)
        )

    # Skip tool-level enforcement for SSE connections (no tool being called).
    # SSE handshakes must be fast — PermissionEnforcer loads the full per-user
    # YAML config (which can be many MB due to auto-discovered paths).
    # Tool-level checks happen on /messages, not on /sse.
    if not tool_name:
        return

    # Initialize enforcer for the specific server config
    server_config_file = CONFIGS_DIR / server_name / f"{user_id}.yaml"
    if not server_config_file.exists():
        server_config_file = (
            CONFIGS_DIR / f"{server_name}-mcp" / f"{user_id}.yaml"
        )
    if not server_config_file.exists():
        server_config_file = CONFIGS_DIR / f"{server_name}.yaml"
    if not server_config_file.exists():
        server_config_file = CONFIGS_DIR / f"{server_name}-mcp.yaml"

    if server_config_file.exists():
        try:
            enforcer = PermissionEnforcer(str(server_config_file))
            enforcer.check_tool_access(user_id, tool_name)
        except ForbiddenError as e:
            logger.warning(
                "Access denied for user=%s tool=%s: %s", user_id, tool_name, e
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=str(e)
            )
        except Exception as e:
            logger.error("Enforcer error for user=%s: %s", user_id, e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Enforcer error: {e}",
            )


@app.get("/health")
async def health_check():
    return {"status": "ok", "gateway": "zero-trust-mcp"}


@app.api_route("/mcp/{server_name}/sse", methods=["GET", "POST"])
async def handle_sse(
    server_name: str,
    request: Request,
    authorization: str | None = Header(None),
    x_mcp_user_id: str | None = Header(None, alias="X-MCP-User-ID"),
):
    user_id, user_key = _extract_credentials(authorization, x_mcp_user_id)
    _verify_and_enforce(server_name, user_id, user_key)

    target_base = await _resolve_target_base(server_name)
    if not target_base:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP server '{server_name}'",
        )

    url = f"{target_base}/sse"
    client = httpx.AsyncClient(timeout=None)
    # Exclude Host header so httpx uses the target host
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
        logger.error("Error proxying to target %s: %s", url, e)
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
    user_id, user_key = _extract_credentials(authorization, x_mcp_user_id)
    body_bytes = await request.body()
    tool_name = None
    tool_args = None

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
        if payload.get("method") == "tools/call":
            params = payload.get("params", {})
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})
    except Exception:
        pass

    _verify_and_enforce(
        server_name, user_id, user_key, tool_name=tool_name, tool_args=tool_args
    )

    target_base = await _resolve_target_base(server_name)
    if not target_base:
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
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to post message to target server '{server_name}' at {url}: {e}",
        )
