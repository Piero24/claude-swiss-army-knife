"""Permission enforcer — validates file and command access, prevents path traversal and command injection."""

import contextvars
import fnmatch
import json
import os
import re
from pathlib import Path
from typing import Optional

from .audit import AuditLogger
from .config import ConfigLoader, load_config
from .models import AccessLevel, CommandRule, ServerConfig
from .resolver import PathResolver


# Context variable for the current agent/user identity.
# Set once per request in call_tool() and read automatically by check()/check_command().
_current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user_id", default="default"
)

# Observed sub-agent label — caller-controlled, untrusted, audit-only.
# Set from CLAUDE_AGENT_ID env var. Never used for access control decisions.
_observed_subagent_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "observed_subagent_id", default=""
)


# Shell metacharacters that enable command chaining / injection
_SHELL_METACHARS = re.compile(r"[;&|`$(){}\]\[<>!\\'\"]")


def _tool_allowed(user, tool_name: str) -> bool:
    """Check if a tool is in the user's allowed tool list.

    Args:
        user: A UserConfig instance.
        tool_name: The MCP tool name to check.

    Returns:
        True if the tool is allowed for this user.
    """
    if not user.tools:
        return True
    if "*" in user.tools:
        return True
    return tool_name in user.tools


class ForbiddenError(Exception):
    """Raised when an operation is denied by the permission engine."""

    def __init__(
        self,
        message: str,
        path: Optional[str] = None,
        command: Optional[str] = None,
    ):
        super().__init__(message)
        self.path = path
        self.command = command


class PermissionEnforcer:
    """Main enforcer — checks file and command access against configured rules.

    Usage:
        enforcer = PermissionEnforcer("/etc/mcp/config.yaml")
        enforcer.check("read", "/var/log/nginx/access.log")
        enforcer.check_command("systemctl status nginx")
    """

    def __init__(self, config_path: str):
        self._config_path = Path(config_path).resolve()
        self._loader = ConfigLoader(self._config_path)
        self._config: Optional[ServerConfig] = None
        self._path_resolver: Optional[PathResolver] = None
        self._audit: Optional[AuditLogger] = None
        self.reload()

    def reload(self) -> None:
        """Reload the configuration from disk (used for hot-reload)."""
        self._config = self._loader.load()
        self._path_resolver = PathResolver(
            rules=self._config.permissions.paths,
            default_access=self._config.permissions.default_access,
        )
        self._audit = AuditLogger(self._config.server.audit_log)

    @property
    def config(self) -> ServerConfig:
        """Get the current config (raises if not loaded)."""
        if self._config is None:
            raise RuntimeError("Config not loaded")
        return self._config

    # Map MCP internal server names → web UI server keys
    _SERVER_KEY_MAP = {
        "ubuntu-mcp": "ubuntu-server",
        "obsidian-mcp": "obsidian",
        "synology-mcp": "synology-nas",
    }

    def is_server_enabled(self, settings_dir: str = "/app/configs") -> bool:
        """Check if this server is enabled in settings.json.

        Args:
            settings_dir: Directory containing settings.json.

        Returns:
            True if the server is enabled, False if explicitly disabled.
            Defaults to True if settings.json is missing or unreadable.
        """
        try:
            settings_path = Path(settings_dir) / "settings.json"
            if not settings_path.exists():
                return True
            with open(settings_path, "r") as f:
                settings = json.load(f)
            servers = settings.get("servers", {})
            mcp_name = self._config.server.name if self._config else ""
            # Resolve via map, fall back to exact match
            key = self._SERVER_KEY_MAP.get(mcp_name, mcp_name)
            return servers.get(key, {}).get("enabled", True)
        except Exception:
            return True  # can't read settings → assume enabled

    def authenticate(
        self, user_id: str, user_key: str, users_config_path: str = ""
    ) -> bool:
        """Validate user credentials against users.yaml.

        Args:
            user_id: The user ID from MCP_USER_ID env var.
            user_key: The plaintext key from MCP_USER_KEY env var.
            users_config_path: Path to users.yaml. Defaults to
                <config_dir>/users.yaml.

        Returns:
            True if authentication succeeds.

        Raises:
            AuthenticationError: If credentials are invalid or user is disabled.
        """
        # If no identity is provided, skip authentication (allow "default")
        if user_id == "default" and not user_key:
            return True

        from .users import AuthenticationError, load_users, validate_user

        if not users_config_path:
            users_config_path = str(self._config_path.parent / "users.yaml")

        users = load_users(users_config_path)
        validate_user(users, user_id, user_key)
        return True

    def check_tool_access(self, user_id: str, tool_name: str) -> bool:
        """Check if an agent is allowed to use a specific tool.

        Evaluates the access mode and the user's tool list. Must be called
        after :meth:`authenticate` so the agent identity is established.

        Args:
            user_id: The agent/user ID (from MCP_USER_ID or "default").
            tool_name: The MCP tool name being invoked.

        Returns:
            True if the agent is allowed to use the tool.

        Raises:
            ForbiddenError: If the agent is blocked, not in allowlist,
                or doesn't have access to the tool.
        """
        from .users import load_users

        users = load_users(str(self._config_path.parent / "users.yaml"))
        mode = users.mode

        # Find the user in the list (None if not listed)
        user = next((u for u in users.users if u.id == user_id), None)

        if mode == "open":
            if user and not user.enabled:
                raise ForbiddenError(f"User '{user_id}' is disabled")
            return True

        if mode == "allowlist":
            if user is None:
                raise ForbiddenError(
                    f"Agent '{user_id}' is not in the allowlist"
                )
            if not user.enabled:
                raise ForbiddenError(f"User '{user_id}' is disabled")
            if not _tool_allowed(user, tool_name):
                raise ForbiddenError(
                    f"Tool '{tool_name}' not allowed for user '{user_id}'"
                )
            return True

        if mode == "blocklist":
            if user and not user.enabled:
                raise ForbiddenError(f"User '{user_id}' is blocked")
            return True

        return True

    def check(self, required_access: str, path: str, tool: str = "") -> bool:
        """Check if the given access level is allowed for a filesystem path.

        Args:
            required_access: The access level needed ("read" or "write").
            path: The filesystem path to access.
            tool: The MCP tool name making the request (for audit logging).

        Returns:
            True if access is granted.

        Raises:
            ForbiddenError: If access is denied.
        """
        required = AccessLevel(required_access)
        granted = self._path_resolver.resolve(path)
        user_id = _current_user_id.get()
        subagent_id = _observed_subagent_id.get()

        if not granted.grants(required):
            self._audit.denied(
                self._config.server.name,
                "file",
                path,
                required_access=required.value,
                granted_access=granted.value,
                reason=f"path not in config or insufficient access (have {granted.value}, need {required.value})",
                tool=tool,
                user_id=user_id,
                subagent_id=subagent_id,
            )
            raise ForbiddenError(
                f"Access denied: '{path}' has {granted.value} access, "
                f"but {required.value} is required",
                path=path,
            )

        self._audit.allowed(
            self._config.server.name,
            "file",
            path,
            access=required.value,
            granted=granted.value,
            tool=tool,
            user_id=user_id,
            subagent_id=subagent_id,
        )
        return True

    def check_command(self, command: str, tool: str = "") -> bool:
        """Check if a shell command is allowed.

        Args:
            command: The full shell command to execute.

        Returns:
            True if the command is allowed.

        Raises:
            ForbiddenError: If the command is denied or contains injection attempts.
        """
        user_id = _current_user_id.get()
        subagent_id = _observed_subagent_id.get()

        # 1. Block shell metacharacters (command injection prevention)
        if _SHELL_METACHARS.search(command):
            self._audit.denied(
                self._config.server.name,
                "command",
                command,
                reason="command contains forbidden shell metacharacters",
                tool=tool,
                user_id=user_id,
                subagent_id=subagent_id,
            )
            raise ForbiddenError(
                f"Command denied: contains forbidden shell metacharacters",
                command=command,
            )

        # 2. Match against command allowlist
        rules = self._config.permissions.commands
        default = self._config.permissions.default_command_access
        matched_rule = None

        for rule in rules:
            if fnmatch.fnmatch(command, rule.pattern):
                matched_rule = rule
                break

        if matched_rule is None:
            # No matching rule — use default
            granted = default
        else:
            granted = matched_rule.access

        # For commands, any non-none access allows execution
        if granted == AccessLevel.NONE:
            self._audit.denied(
                self._config.server.name,
                "command",
                command,
                reason="command not in allowlist or explicitly denied",
                tool=tool,
                user_id=user_id,
                subagent_id=subagent_id,
            )
            raise ForbiddenError(
                f"Command denied: '{command}' is not in the allowlist",
                command=command,
            )

        self._audit.allowed(
            self._config.server.name,
            "command",
            command,
            access="execute",
            granted=granted.value,
            tool=tool,
            user_id=user_id,
            subagent_id=subagent_id,
        )
        return True

    def safe_resolve_path(
        self, requested_path: str, mount_prefix: str, allowed_bases: list[str]
    ) -> Path:
        """Safely resolve a requested path within allowed base directories.

        This prevents path traversal attacks by:
        1. Blocking null bytes and control characters
        2. Resolving the full path
        3. Verifying the resolved path is within one of the allowed bases

        Args:
            requested_path: The user-requested path.
            mount_prefix: Path prefix for the container mount (e.g., "/mnt/host").
            allowed_bases: List of allowed base directories (from the enforcer).

        Returns:
            The safely resolved absolute Path.

        Raises:
            ForbiddenError: If the path contains invalid characters or escapes allowed bases.
        """
        # Reject null bytes and control characters
        if any(ord(c) < 32 for c in requested_path):
            raise ForbiddenError(
                "Path contains invalid characters", path=requested_path
            )

        # Normalize
        clean = requested_path.lstrip("/")
        full = (Path(mount_prefix) / clean).resolve(strict=False)

        # Verify within allowed bases
        for base in allowed_bases:
            resolved_base = (Path(mount_prefix) / base.lstrip("/")).resolve()
            try:
                full.relative_to(resolved_base)
                return full
            except ValueError:
                continue

        raise ForbiddenError(
            f"Path '{requested_path}' is outside allowed directories",
            path=requested_path,
        )
