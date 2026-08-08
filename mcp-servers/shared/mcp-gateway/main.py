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

# Container internal URLs inside mcp-internal network
CONTAINER_TARGETS = {
    "ubuntu-server": "http://ubuntu-mcp:8000",
    "ubuntu-mcp": "http://ubuntu-mcp:8000",
    "obsidian": "http://obsidian-mcp:8000",
    "obsidian-mcp": "http://obsidian-mcp:8000",
    "synology-nas": "http://synology-mcp:8000",
    "synology-mcp": "http://synology-mcp:8000",
    "github": "http://github-mcp:8000",
    "github-mcp": "http://github-mcp:8000",
    "link-manager": "http://link-manager-mcp:8000",
    "link-manager-mcp": "http://link-manager-mcp:8000",
}


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

    # Initialize enforcer for the specific server config
    server_config_file = CONFIGS_DIR / server_name / f"{user_id}.yaml"
    if not server_config_file.exists():
        server_config_file = CONFIGS_DIR / f"{server_name}.yaml"

    if server_config_file.exists():
        enforcer = PermissionEnforcer(server_name, str(server_config_file))
        try:
            if tool_name:
                enforcer.check_tool_access(user_id, tool_name)
        except ForbiddenError as e:
            logger.warning(
                "Access denied for user=%s tool=%s: %s", user_id, tool_name, e
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=str(e)
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

    target_base = CONTAINER_TARGETS.get(server_name)
    if not target_base:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP server '{server_name}'",
        )

    url = f"{target_base}/sse"
    client = httpx.AsyncClient(timeout=None)
    req = client.build_request(
        request.method,
        url,
        headers=request.headers.raw,
        content=request.stream(),
    )
    res = await client.send(req, stream=True)
    return StreamingResponse(
        res.aiter_raw(),
        status_code=res.status_code,
        headers=dict(res.headers),
        background=httpx.Response.aclose,
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

    target_base = CONTAINER_TARGETS.get(server_name)
    if not target_base:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP server '{server_name}'",
        )

    headers = dict(request.headers)
    headers["X-MCP-User-ID"] = user_id
    headers["X-MCP-User-Key"] = user_key

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{target_base}/messages",
            content=body_bytes,
            headers=headers,
            params=request.query_params,
        )
        return Response(
            content=res.content,
            status_code=res.status_code,
            headers=dict(res.headers),
        )
