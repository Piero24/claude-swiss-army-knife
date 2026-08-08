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

    Supports a hook system for per-MCP customization. Register hooks
    via proxy.hook(name, fn) or @proxy.hook(name). See the custom/
    directory in each proxy server for examples.
    """

    def __init__(self, config_path: str, config_dir: str | None = None):
        self._config_path = Path(config_path).resolve()
        self._raw_config: dict[str, Any] = {}
        self._reload_config()
        super().__init__(
            self._raw_config["server"]["name"],
            config_path,
            config_dir=config_dir,
        )
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._tools_cache: list[dict] = []
        self._init_lock = asyncio.Lock()
        self._request_id = 0
        self._hooks: dict[str, list] = {}
        self._load_custom()

    # ── Hook system ──────────────────────────────────────

    def hook(self, name: str, fn=None):
        """Register a hook callback. Can be used as @proxy.hook(name)."""
        if fn is None:
            return lambda f: self.hook(name, f)
        self._hooks.setdefault(name, []).append(fn)
        return fn

    async def _trigger(self, name: str, *args, **kwargs):
        """Trigger all hooks registered for a name. Returns the last non-None result."""
        result = None
        for fn in self._hooks.get(name, []):
            ret = fn(*args, **kwargs)
            if asyncio.iscoroutine(ret):
                ret = await ret
            if ret is not None:
                result = ret
        return result

    def _load_custom(self):
        """Try to load a custom module for this proxy instance."""
        import importlib

        for module_name in ("custom", "src.custom"):
            try:
                custom = importlib.import_module(module_name)
                if hasattr(custom, "register"):
                    custom.register(self)
                    logger.info("Loaded custom module: %s", module_name)
                    return
            except ImportError:
                pass

    def _reload_config(self) -> None:
        with open(self._config_path, "r") as f:
            self._raw_config = yaml.safe_load(f) or {}

    def reload_config(self) -> None:
        """Reload enforcer, prompts, raw proxy YAML, and tool cache."""
        super().reload_config()
        self._reload_config()
        self._tools_cache = []
        self.warm_up()

    # ── Tool-name resolution for prompt injection ──────────

    def _get_tool_names(self) -> set[str]:
        """Return actual tool names from the subprocess cache."""
        return {
            t.get("name")
            for t in self._tools_cache
            if isinstance(t, dict) and t.get("name")
        }

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

    def warm_up(self) -> None:
        """Fire-and-forget tool-cache warm-up so the first connection sees
        resolved tool names instead of raw glob patterns."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._warm())

    async def _warm(self) -> None:
        try:
            await self._initialize_and_cache()
        except Exception:
            logger.warning("Tool cache warm-up failed", exc_info=True)

    async def _initialize_and_cache(self) -> None:
        """Initialize the subprocess and cache available tools (idempotent)."""
        if (
            self._tools_cache
            and self._proc is not None
            and self._proc.returncode is None
        ):
            return
        async with self._init_lock:
            if (
                self._tools_cache
                and self._proc is not None
                and self._proc.returncode is None
            ):
                return
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
        modified = await self._trigger("on_tools_cached", self._tools_cache)
        if modified:
            self._tools_cache = modified
        logger.info("Cached %d tools from subprocess", len(self._tools_cache))

    def setup(self) -> None:
        @self.server.list_tools()
        async def list_tools() -> list:
            await self._initialize_and_cache()
            return self._tools_cache

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            user_id = self._request_user_id_val or os.environ.get(
                "MCP_USER_ID", "default"
            )
            _current_user_id.set(user_id)
            _observed_subagent_id.set(os.environ.get("CLAUDE_AGENT_ID", ""))

            user_key = self._request_user_key_val or os.environ.get(
                "MCP_USER_KEY", ""
            )
            try:
                self.enforcer.authenticate(user_id, user_key)
            except Exception as e:
                logger.info(
                    "Auth failed for user=%s tool=%s: %s", user_id, name, e
                )
                return self.format_error(e)

            try:
                self.enforcer.check_tool_access(user_id, name)
            except Exception as e:
                logger.info(
                    "Tool access denied for user=%s tool=%s: %s",
                    user_id,
                    name,
                    e,
                )
                return self.format_error(e)

            try:
                self.enforcer.check_tool(name)
            except Exception as e:
                logger.warning(
                    "Proxy tool deny: user=%s tool=%s: %s", user_id, name, e
                )
                return self.format_error(e)

            try:
                # Trigger before-tool-call hook — can modify name/arguments
                hook_result = await self._trigger(
                    "on_before_tool_call", name, arguments
                )
                if hook_result:
                    name, arguments = hook_result

                resp = await self._send_request(
                    "tools/call",
                    {
                        "name": name,
                        "arguments": arguments,
                    },
                )
                result = resp.get("result", {})
                content = result.get("content", [])

                # Trigger after-tool-call hook
                modified = await self._trigger(
                    "on_after_tool_call", name, result
                )
                if modified:
                    result = modified
                    content = result.get("content", content)

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
                logger.error(
                    "Proxy tool %s failed for user=%s: %s", name, user_id, e
                )
                return self.format_error(e)
