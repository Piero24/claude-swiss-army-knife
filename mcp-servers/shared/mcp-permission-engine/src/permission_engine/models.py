"""Permission engine models — Pydantic v2 schemas for config validation."""

from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class AccessLevel(str, Enum):
    """Access levels in increasing order of privilege.

    none  = explicitly denied
    read  = list, read, search
    write = create, update, delete (also implies read)
    """

    NONE = "none"
    READ = "read"
    WRITE = "write"

    def grants(self, required: "AccessLevel") -> bool:
        """Check if this access level is sufficient for the required level."""
        order = {AccessLevel.NONE: 0, AccessLevel.READ: 1, AccessLevel.WRITE: 2}
        return order[self] >= order[required]


class PathRule(BaseModel):
    """A permission rule for a filesystem path."""

    id: str = Field(default_factory=lambda: uuid4().hex[:12])
    path: str = Field(..., description="Glob pattern for matching paths (e.g., /var/log/**)")
    access: AccessLevel = Field(..., description="Access level granted for this path")
    description: Optional[str] = Field(default=None, description="Human-readable description")


class CommandRule(BaseModel):
    """A permission rule for a shell command pattern."""

    id: str = Field(default_factory=lambda: uuid4().hex[:12])
    pattern: str = Field(..., description="Glob pattern for matching commands (e.g., 'systemctl status *')")
    access: AccessLevel = Field(..., description="Access level required to run this command")
    description: Optional[str] = Field(default=None, description="Human-readable description")


class ServerInfo(BaseModel):
    """Metadata about the MCP server."""

    name: str = Field(..., description="Server name identifier")
    log_level: str = Field(default="INFO", description="Log level (DEBUG, INFO, WARNING, ERROR)")
    audit_log: str = Field(default="/var/log/mcp/audit.log", description="Path to audit log file")


class PermissionsConfig(BaseModel):
    """Top-level permissions configuration."""

    default_access: AccessLevel = Field(default=AccessLevel.NONE, description="Default access when no rule matches")
    paths: list[PathRule] = Field(default_factory=list, description="Ordered list of path rules")
    commands: list[CommandRule] = Field(default_factory=list, description="Ordered list of command rules")
    default_command_access: AccessLevel = Field(default=AccessLevel.NONE, description="Default command access when no rule matches")


class ServerConfig(BaseModel):
    """Full server configuration."""

    server: ServerInfo = Field(..., description="Server metadata")
    permissions: PermissionsConfig = Field(default_factory=PermissionsConfig, description="Permission rules")
