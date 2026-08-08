"""Base MCP Server class for standardizing permission checks and error handling."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Awaitable, Callable

from .enforcer import PermissionEnforcer, _current_user_id, _observed_subagent_id

import contextvars

_request_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_user_id", default=""
)
_request_user_key: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_user_key", default=""
)

logger = logging.getLogger("mcp-base-server")


def _import_mcp():
    """Lazy-import MCP types — only needed at runtime inside a container."""
    from mcp.server import Server
    from mcp.types import TextContent

    return Server, TextContent


class BaseMCPServer:
    """Base class for MCP servers that use the permission engine.

    Handles:
    - Standardized tool handler wrapper (authentication, authorization, error formatting)
    - Configuration loading and reloading
    """

    def __init__(self, name: str, config_path: str):
        Server, _ = _import_mcp()
        self.server = Server(name)
        self.config_path = config_path
        self.enforcer = PermissionEnforcer(config_path)
        # Per-request user info — set by handle_messages before each tool call.
        # Context vars don't propagate across asyncio task boundaries
        # (SSE and /messages are separate HTTP requests → separate tasks).
        self._request_user_id_val: str = ""
        self._request_user_key_val: str = ""

    def reload_config(self) -> None:
        """Reload the permission enforcer config."""
        self.enforcer.reload()
        logger.info(
            "Config reloaded — %d path rules, %d command rules",
            len(self.enforcer.config.permissions.paths),
            len(self.enforcer.config.permissions.commands),
        )

    def _text(self, text: str) -> list:
        """Build a TextContent list from a JSON string."""
        _, TextContent = _import_mcp()
        return [TextContent(type="text", text=text)]

    def format_error(self, error: Exception | str) -> list:
        """Standardize error output."""
        return self._text(json.dumps({"error": str(error)}, indent=2))

    @staticmethod
    def _json_default(obj: Any) -> Any:
        """Convert non-JSON-serializable objects (dates, datetimes, sets) to strings."""
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        if isinstance(obj, (set, tuple)):
            return list(obj)
        return str(obj)

    def format_result(self, result: Any) -> list:
        """Standardize successful result output."""
        return self._text(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False,
                default=self._json_default,
            )
        )

    async def handle_tool_call(
        self,
        name: str,
        arguments: dict,
        handler_fn: Callable[[str, dict], Awaitable[Any]],
    ) -> list:
        """Wrap a tool call with permission checks and error handling.

        Args:
            name: The tool name.
            arguments: The tool arguments.
            handler_fn: An async function that takes (name, arguments) and returns the result dict/list.
        """
        user_id = self._request_user_id_val or os.environ.get(
            "MCP_USER_ID", "default"
        )
        _current_user_id.set(user_id)
        _observed_subagent_id.set(os.environ.get("CLAUDE_AGENT_ID", ""))

        user_key = self._request_user_key_val or os.environ.get(
            "MCP_USER_KEY", ""
        )

        logger.debug("Tool call: %s user=%s", name, user_id)

        try:
            self.enforcer.authenticate(user_id, user_key)
        except Exception as e:
            logger.info("Auth failed for user=%s tool=%s: %s", user_id, name, e)
            return self.format_error(e)

        try:
            self.enforcer.check_tool_access(user_id, name)
        except Exception as e:
            logger.info(
                "Tool access denied for user=%s tool=%s: %s", user_id, name, e
            )
            return self.format_error(e)

        try:
            result = await handler_fn(name, arguments)
            return self.format_result(result)
        except Exception as e:
            logger.error("Tool %s failed for user=%s: %s", name, user_id, e)
            return self.format_error(e)

    async def run(self, transport: str = "stdio", port: int = 8000) -> None:
        """Run the server with specified transport ('sse' or 'stdio')."""
        if transport == "sse":
            from mcp.server.sse import SseServerTransport
            from starlette.applications import Starlette
            from starlette.responses import Response
            from starlette.routing import Route
            import uvicorn

            sse = SseServerTransport("/messages")

            async def handle_sse(request):
                uid = request.headers.get("x-mcp-user-id") or ""
                ukey = request.headers.get("x-mcp-user-key") or ""
                if uid:
                    _request_user_id.set(uid)
                if ukey:
                    _request_user_key.set(ukey)
                async with sse.connect_sse(
                    request.scope, request.receive, request._send
                ) as streams:

                    await self.server.run(
                        streams[0],
                        streams[1],
                        self.server.create_initialization_options(),
                    )
                return Response()

            async def handle_messages(request):
                uid = request.headers.get("x-mcp-user-id") or ""
                ukey = request.headers.get("x-mcp-user-key") or ""
                # Store on instance — context vars don't propagate across
                # asyncio task boundaries (SSE vs /messages are separate tasks).
                self._request_user_id_val = uid
                self._request_user_key_val = ukey
                await sse.handle_post_message(
                    request.scope, request.receive, request._send
                )

            starlette_app = Starlette(
                routes=[
                    Route("/sse", endpoint=handle_sse),
                    Route(
                        "/messages", endpoint=handle_messages, methods=["POST"]
                    ),
                ]
            )
            logger.info(
                "%s running in SSE mode on port %d", self.server.name, port
            )
            config = uvicorn.Config(
                starlette_app, host="0.0.0.0", port=port, log_level="info"
            )
            server = uvicorn.Server(config)
            await server.serve()
        else:
            from mcp.server.stdio import stdio_server

            async with stdio_server() as (read_stream, write_stream):
                logger.info("%s server running (stdio mode)", self.server.name)
                await self.server.run(
                    read_stream,
                    write_stream,
                    self.server.create_initialization_options(),
                )
