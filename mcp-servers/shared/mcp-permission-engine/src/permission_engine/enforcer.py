"""Permission enforcer — validates file and command access, prevents path traversal and command injection."""

import fnmatch
import re
from pathlib import Path
from typing import Optional

from .audit import AuditLogger
from .config import ConfigLoader, load_config
from .models import AccessLevel, CommandRule, ServerConfig
from .resolver import PathResolver


# Shell metacharacters that enable command chaining / injection
_SHELL_METACHARS = re.compile(r"[;&|`$(){}\]\[<>!\\'\"]")


class ForbiddenError(Exception):
    """Raised when an operation is denied by the permission engine."""

    def __init__(self, message: str, path: Optional[str] = None, command: Optional[str] = None):
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

    def check(self, required_access: str, path: str) -> bool:
        """Check if the given access level is allowed for a filesystem path.

        Args:
            required_access: The access level needed ("read" or "write").
            path: The filesystem path to access.

        Returns:
            True if access is granted.

        Raises:
            ForbiddenError: If access is denied.
        """
        required = AccessLevel(required_access)
        granted = self._path_resolver.resolve(path)

        if not granted.grants(required):
            self._audit.denied(self._config.server.name, "file", path,
                               required_access=required.value, granted_access=granted.value,
                               reason=f"path not in config or insufficient access (have {granted.value}, need {required.value})")
            raise ForbiddenError(
                f"Access denied: '{path}' has {granted.value} access, "
                f"but {required.value} is required",
                path=path,
            )

        self._audit.allowed(self._config.server.name, "file", path,
                            access=required.value, granted=granted.value)
        return True

    def check_command(self, command: str) -> bool:
        """Check if a shell command is allowed.

        Args:
            command: The full shell command to execute.

        Returns:
            True if the command is allowed.

        Raises:
            ForbiddenError: If the command is denied or contains injection attempts.
        """
        # 1. Block shell metacharacters (command injection prevention)
        if _SHELL_METACHARS.search(command):
            self._audit.denied(self._config.server.name, "command", command,
                               reason="command contains forbidden shell metacharacters")
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
            self._audit.denied(self._config.server.name, "command", command,
                               reason="command not in allowlist or explicitly denied")
            raise ForbiddenError(
                f"Command denied: '{command}' is not in the allowlist",
                command=command,
            )

        self._audit.allowed(self._config.server.name, "command", command,
                            access="execute", granted=granted.value)
        return True

    def safe_resolve_path(self, requested_path: str, mount_prefix: str,
                          allowed_bases: list[str]) -> Path:
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
            raise ForbiddenError("Path contains invalid characters", path=requested_path)

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
