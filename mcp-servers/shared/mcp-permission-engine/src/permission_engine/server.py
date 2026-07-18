"""Base MCP Server class for standardizing permission checks and error handling."""

import json
import logging
import os
from typing import Any, Awaitable, Callable

from .enforcer import PermissionEnforcer, _current_user_id, _observed_subagent_id

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

    def format_result(self, result: Any) -> list:
        """Standardize successful result output."""
        return self._text(json.dumps(result, indent=2, ensure_ascii=False))

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
        user_id = os.environ.get("MCP_USER_ID", "default")
        _current_user_id.set(user_id)
        _observed_subagent_id.set(os.environ.get("CLAUDE_AGENT_ID", ""))

        user_key = os.environ.get("MCP_USER_KEY", "")

        try:
            self.enforcer.authenticate(user_id, user_key)
        except Exception as e:
            return self.format_error(e)

        try:
            self.enforcer.check_tool_access(user_id, name)
        except Exception as e:
            return self.format_error(e)

        try:
            result = await handler_fn(name, arguments)
            return self.format_result(result)
        except Exception as e:
            return self.format_error(e)
