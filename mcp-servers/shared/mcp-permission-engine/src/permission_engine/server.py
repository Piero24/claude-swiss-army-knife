"""Base MCP Server class for standardizing permission checks and error handling."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
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

_TOP_LEVEL_KEY = re.compile(r"^([A-Za-z_][\w-]*):\s*(.*)$")
_HAS_GLOB = re.compile(r"[*?\[]")
# 2-space keys inside the "permissions:" block (e.g. "  tools:", "  default_tool_access:")
_TWO_SPACE_KEY = re.compile(r"^  [A-Za-z_][\w-]*:")


def extract_server_prompt(yaml_path: Path) -> str | None:
    """Read ONLY the top-level ``server:`` block; never parse the full file.

    Stops at the next top-level YAML key so that massive ``permissions:``
    sections (200k+ lines on Synology) are never touched.
    """
    try:
        lines = yaml_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    in_server = False
    block_lines: list[str] = []
    for line in lines:
        m = _TOP_LEVEL_KEY.match(line)
        if m:
            if m.group(1) == "server":
                in_server = True
                continue  # skip "server:" itself — parse only its value block
            if in_server:
                break
        elif in_server:
            block_lines.append(line)
    if not block_lines:
        return None
    try:
        import yaml

        # block_lines are the indented children of "server:" —
        # yaml.safe_load parses them as a flat mapping: {"name": ..., "prompt": ...}
        data = yaml.safe_load("\n".join(block_lines)) or {}
        prompt = data.get("prompt")
    except Exception:
        return None
    if not isinstance(prompt, str) or not prompt.strip():
        return None
    from .config import _resolve_env_vars

    return _resolve_env_vars(prompt)


def extract_tool_rules(yaml_path: Path) -> tuple[list, str | None]:
    """Extract ``permissions.tools`` and ``default_tool_access`` without parsing
    paths/commands — only the *tools* block near the end of the file is touched.

    Returns ``(rules, default_access_string_or_None)``.  *rules* is a list of
    dicts (raw YAML — not ``ToolRule`` pydantic objects so this module stays
    importable without the optional YAML dependency at module level).
    """
    try:
        lines = yaml_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return [], None
    in_permissions = False
    tool_block: list[str] = []
    default_access: str | None = None
    for line in lines:
        m = _TOP_LEVEL_KEY.match(line)
        if m:
            if m.group(1) == "permissions":
                in_permissions = True
                continue
            if in_permissions:
                # Next top-level key → permissions block ended
                break
        if not in_permissions:
            continue
        if not tool_block:
            # Looking for the start of "  tools:"
            stripped = line.lstrip()
            if stripped.startswith("tools:"):
                tool_block.append(line)
                # Inline "tools: []" or "tools: {}"?
                tail = stripped[len("tools:") :]
                if tail.strip():
                    # Inline value — parse and stop
                    continue
        else:
            # Collecting tool entries — stop at next 2-space key
            if _TWO_SPACE_KEY.match(line):
                stripped = line.strip()
                if stripped.startswith("default_tool_access:"):
                    val = stripped.split(":", 1)[1].strip()
                    default_access = val if val else None
                break
            tool_block.append(line)
    if not tool_block:
        return [], default_access
    try:
        import yaml

        data = yaml.safe_load("\n".join(tool_block)) or {}
    except Exception:
        return [], default_access
    tools = data.get("tools")
    if not isinstance(tools, list):
        return [], default_access
    return tools, default_access


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

    def __init__(
        self,
        name: str,
        config_path: str,
        config_dir: str | None = None,
        tool_names: list[str] | None = None,
    ):
        Server, _ = _import_mcp()
        self.server = Server(name)
        self.config_path = config_path
        self.config_dir = Path(config_dir) if config_dir else None
        self.enforcer = PermissionEnforcer(config_path)
        # Keep the default enforcer for reload_config and as fallback.
        self._default_enforcer = self.enforcer
        # Per-user enforcer cache: user_id → PermissionEnforcer.
        # Each user has their own <user_id>.yaml config with isolated permissions.
        self._user_enforcers: dict[str, PermissionEnforcer] = {}
        self._known_tool_names: set[str] = set(tool_names or [])
        # Per-request user info — set by handle_messages before each tool call.
        # Context vars don't propagate across asyncio task boundaries
        # (SSE and /messages are separate HTTP requests → separate tasks).
        self._request_user_id_val: str = ""
        self._request_user_key_val: str = ""
        (
            self._prompts,
            self._tool_rules,
            self._tool_defaults,
        ) = self._load_user_caches()

    def reload_config(self) -> None:
        """Reload the permission enforcer config and refresh caches."""
        self._default_enforcer.reload()
        # Clear per-user enforcer cache so next requests pick up fresh configs.
        self._user_enforcers.clear()
        # Restore default enforcer (current request may have swapped it).
        self.enforcer = self._default_enforcer
        (
            self._prompts,
            self._tool_rules,
            self._tool_defaults,
        ) = self._load_user_caches()
        logger.info(
            "Config reloaded — %d path rules, %d command rules, "
            "%d prompts, %d tool-rule sets",
            len(self._default_enforcer.config.permissions.paths),
            len(self._default_enforcer.config.permissions.commands),
            len(self._prompts),
            len(self._tool_rules),
        )

    def _get_user_enforcer(self, user_id: str) -> PermissionEnforcer:
        """Return a PermissionEnforcer for *user_id*, creating and caching one
        from ``<config_dir>/<user_id>.yaml`` on first access.

        Falls back to the default enforcer when no per-user config exists.
        """
        if not user_id or user_id == "default":
            return self._default_enforcer
        if user_id in self._user_enforcers:
            return self._user_enforcers[user_id]
        if self.config_dir:
            user_config_path = self.config_dir / f"{user_id}.yaml"
            if user_config_path.exists():
                enforcer = PermissionEnforcer(str(user_config_path))
                self._user_enforcers[user_id] = enforcer
                logger.info(
                    "Created per-user enforcer for '%s' from %s",
                    user_id,
                    user_config_path,
                )
                return enforcer
        logger.debug(
            "No per-user config for '%s' — using default enforcer", user_id
        )
        return self._default_enforcer

    def _load_user_caches(
        self,
    ) -> tuple[dict[str, str], dict[str, list], dict[str, str | None]]:
        """Scan config_dir for per-user YAMLs and extract server.prompt AND
        permissions.tools from each — one file read per user.

        Only the ``server:`` and ``tools:`` blocks are ever parsed; the
        massive ``paths:`` section is skipped.
        """
        prompts: dict[str, str] = {}
        tool_rules: dict[str, list] = {}
        tool_defaults: dict[str, str | None] = {}
        if not self.config_dir or not self.config_dir.exists():
            return prompts, tool_rules, tool_defaults
        for f in sorted(self.config_dir.glob("*.yaml")):
            if f.name.startswith("."):
                continue
            prompt = extract_server_prompt(f)
            rules, default_access = extract_tool_rules(f)
            if prompt:
                prompts[f.stem] = prompt
            if rules:
                tool_rules[f.stem] = rules
                tool_defaults[f.stem] = default_access
        logger.debug(
            "Loaded %d user prompts + %d tool-rule sets from %s",
            len(prompts),
            len(tool_rules),
            self.config_dir,
        )
        return prompts, tool_rules, tool_defaults

    def _current_user_id_for_init(self) -> str:
        """Return the user ID for the current initialization handshake."""
        return _request_user_id.get() or os.environ.get("MCP_USER_ID", "")

    # ── tool-name resolution ────────────────────────────────

    def _get_tool_names(self) -> set[str]:
        """Catalog of tool names to resolve fnmatch patterns against.

        Subclasses override to provide their actual tool list (static catalog
        for direct servers, ``_tools_cache`` for proxies).
        """
        return self._known_tool_names

    def _resolve_active_tools(self, rules: list) -> list[str]:
        """Resolve a user's tool-rule patterns against the server's tool catalog.

        Returns a sorted, deduplicated list of tool names that are active for
        this user.  Glob patterns (``search_*``) are expanded against
        ``_get_tool_names()`` when available; exact names pass through
        unconditionally.
        """
        import fnmatch

        known = self._get_tool_names()
        active: list[str] = []
        for rule in rules:
            pattern = (
                rule.get("pattern")
                if isinstance(rule, dict)
                else getattr(rule, "pattern", None)
            )
            access = (
                rule.get("access")
                if isinstance(rule, dict)
                else getattr(rule, "access", None)
            )
            if not pattern or access != "active":
                continue
            if _HAS_GLOB.search(pattern):
                if known:
                    active.extend(
                        n for n in sorted(known) if fnmatch.fnmatch(n, pattern)
                    )
                else:
                    # Cold cache fallback (proxy before first list_tools)
                    active.append(pattern)
            elif not known or pattern in known:
                active.append(pattern)
        return sorted(set(active))

    def _compose_instructions(
        self,
        prompt: str | None,
        active_tools: list[str],
        default_access: str | None,
    ) -> str | None:
        """Build the final ``instructions`` string from the user's custom
        prompt and their active tool list."""
        if not prompt and not active_tools:
            return None
        lines: list[str] = []
        if prompt:
            lines.append(prompt)
        if active_tools:
            if prompt:
                lines += ["", "---"]
            lines.append("Here are the tools that are active for you:")
            lines += [f"- {name}" for name in active_tools]
            if default_access != "active":
                lines.append("Other tools are disabled.")
        return "\n".join(lines)

    def create_initialization_options(self):
        """Return init options with the connecting user's prompt + active
        tool list injected.

        Returns the native ``InitializationOptions`` object (not a dict)
        so that ``Server.run()`` and ``ServerSession`` receive the correct
        type regardless of MCP library version.
        """
        opts = self.server.create_initialization_options()
        user_id = self._current_user_id_for_init()
        if user_id and user_id != "default":
            prompt = self._prompts.get(user_id)
            rules = self._tool_rules.get(user_id, [])
            instructions = self._compose_instructions(
                prompt,
                self._resolve_active_tools(rules) if rules else [],
                self._tool_defaults.get(user_id),
            )
            if instructions:
                opts.instructions = instructions
        return opts

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

        Swaps ``self.enforcer`` to the per-user enforcer so that every
        downstream permission check (paths, commands, tools) uses the
        correct user's isolated config, not a single shared config.
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

        # Swap to the per-user enforcer so path/command/tool rules come
        # from this user's own <user_id>.yaml, not a shared global config.
        self.enforcer = self._get_user_enforcer(user_id)

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
                        self.create_initialization_options(),
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
                    self.create_initialization_options(),
                )
