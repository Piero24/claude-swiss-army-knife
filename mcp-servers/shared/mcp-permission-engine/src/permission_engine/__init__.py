"""
MCP Permission Engine — Config-driven access control for MCP servers.

Provides:
- YAML-based permission configuration with Pydantic v2 validation
- Glob-based path matching with longest-match precedence and explicit-deny override
- Command allowlisting with shell injection prevention
- Path traversal prevention
- Structured JSON audit logging (JSON Lines)

Usage:
    from permission_engine import PermissionEnforcer, load_config

    enforcer = PermissionEnforcer("/etc/mcp/config.yaml")
    enforcer.check("read", "/var/log/nginx/access.log")
    enforcer.check_command("systemctl status nginx")
"""

from .audit import AuditLogger, read_audit_log
from .config import ConfigLoader, load_config
from .enforcer import ForbiddenError, PermissionEnforcer, _current_user_id, _observed_subagent_id
from .models import (
    AccessLevel,
    CommandRule,
    PathRule,
    PermissionsConfig,
    ServerConfig,
    ServerInfo,
)
from .users import AuthenticationError, UserConfig, UsersConfig, load_users, validate_user

__all__ = [
    # Enforcer
    "PermissionEnforcer",
    "ForbiddenError",
    "_current_user_id",
    "_observed_subagent_id",
    # Config
    "load_config",
    "ConfigLoader",
    # Models
    "AccessLevel",
    "PathRule",
    "CommandRule",
    "PermissionsConfig",
    "ServerConfig",
    "ServerInfo",
    # Audit
    "AuditLogger",
    "read_audit_log",
    # Users
    "AuthenticationError",
    "UserConfig",
    "UsersConfig",
    "load_users",
    "validate_user",
]
