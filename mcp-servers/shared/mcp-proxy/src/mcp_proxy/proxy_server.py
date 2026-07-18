"""Generic MCP proxy — wraps external MCP servers with permission gating."""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import yaml
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent
from permission_engine import (
    BaseMCPServer,
    PermissionEnforcer,
    ProxyConfig,
    ServerConfig,
    _current_user_id,
    _observed_subagent_id,
)

logger = logging.getLogger("mcp-proxy")


class ProxyServer(BaseMCPServer):
    """MCP server that proxies requests to an external MCP subprocess.

    Reads a proxy config section from the YAML to determine which
    external MCP to spawn. Every tool call goes through the permission
    engine before being forwarded.
    """

    def __init__(self, config_path: str):
        self._config_path = Path(config_path).resolve()
        self._raw_config: dict[str, Any] = {}
        self._reload_config()
        super().__init__(self._raw_config["server"]["name"], config_path)
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._tools_cache: list[dict] = []
        self._request_id = 0

    def _reload_config(self) -> None:
        with open(self._config_path, "r") as f:
            self._raw_config = yaml.safe_load(f) or {}

    def _proxy_config(self) -> ProxyConfig:
        raw = self._raw_config.get("proxy", {})
        return ProxyConfig(**raw)

    async def _ensure_subprocess(self) -> None:
        if self._proc is not None and self._proc.returncode is None:
            return
        cfg = self._proxy_config()
        env = {**os.environ, **cfg.env}
        logger.info("Spawning proxy subprocess: %s %s", cfg.command, cfg.args)
        self._proc = await asyncio.create_subprocess_exec(
            cfg.command,
            *cfg.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

    async def _send_request(
        self, method: str, params: dict | None = None
    ) -> dict:
        """Send a JSON-RPC request to the subprocess and return the result."""
        await self._ensure_subprocess()
        self._request_id += 1
        req = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params or {},
        }
        raw = json.dumps(req) + "\n"
        self._proc.stdin.write(raw.encode())
        await self._proc.stdin.drain()

        line = await self._proc.stdout.readline()
        if not line:
            raise RuntimeError("Subprocess closed stdout")
        return json.loads(line.decode())

    async def _initialize_and_cache(self) -> None:
        """Initialize the subprocess and cache available tools."""
        await self._ensure_subprocess()
        init = await self._send_request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "mcp-proxy", "version": "1.0.0"},
            },
        )
        logger.info(
            "Subprocess initialized: %s",
            init.get("result", {}).get("serverInfo", {}),
        )
        tools_resp = await self._send_request("tools/list")
        self._tools_cache = tools_resp.get("result", {}).get("tools", [])
        logger.info("Cached %d tools from subprocess", len(self._tools_cache))

    def setup(self) -> None:
        @self.server.list_tools()
        async def list_tools() -> list:
            await self._initialize_and_cache()
            return self._tools_cache

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
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
                self.enforcer.check_tool(name)
            except Exception as e:
                return self.format_error(e)

            try:
                resp = await self._send_request(
                    "tools/call",
                    {
                        "name": name,
                        "arguments": arguments,
                    },
                )
                result = resp.get("result", {})
                content = result.get("content", [])
                return [
                    TextContent(
                        type="text",
                        text=json.dumps(
                            content if content else result,
                            indent=2,
                            ensure_ascii=False,
                        ),
                    )
                ]
            except Exception as e:
                return self.format_error(e)
