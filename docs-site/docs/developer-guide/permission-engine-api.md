---
sidebar_position: 4
---

# Permission Engine API

Reference for the shared permission engine used by all MCP servers in the suite.

## Installation

```bash
pip install -e ./mcp-servers/shared/mcp-permission-engine
```

## Quick Start

```python
from permission_engine import PermissionEnforcer, load_config

# Load and enforce
enforcer = PermissionEnforcer("/app/config.yaml")
enforcer.check("read", "/var/log/nginx/access.log")
enforcer.check_command("systemctl status nginx")
```

## PermissionEnforcer

The main entry point. Validates file and command access against configured rules.

```python
class PermissionEnforcer:
    def __init__(self, config_path: str)
    def reload(self) -> None
    def check(self, required_access: str, path: str, tool: str = "") -> bool
    def check_command(self, command: str, tool: str = "") -> bool
    def safe_resolve_path(self, requested_path: str, mount_prefix: str, allowed_bases: list[str]) -> Path
```

### `check(required_access, path, tool="")`

Check if the given access level is allowed for a filesystem path.

- `required_access`: `"read"` or `"write"`
- `path`: Filesystem path to access
- `tool`: MCP tool name for audit logging
- Returns `True` if granted
- Raises `ForbiddenError` if denied

### `check_command(command, tool="")`

Check if a shell command is allowed.

- `command`: Full shell command string
- `tool`: MCP tool name for audit logging
- Returns `True` if granted
- Raises `ForbiddenError` if denied or if command contains shell metacharacters (injection prevention)

### `safe_resolve_path(requested_path, mount_prefix, allowed_bases)`

Safely resolve a user-requested path within allowed base directories. Prevents path traversal attacks by:
1. Blocking null bytes and control characters
2. Resolving the full path
3. Verifying the resolved path is within an allowed base

### `reload()`

Reload the configuration from disk. Called automatically by the config watcher.

## PathResolver

Resolves access levels for file paths against configured rules using glob matching.

```python
class PathResolver:
    def __init__(self, rules: list[PathRule], default_access: AccessLevel = AccessLevel.NONE)
    def resolve(self, requested_path: str) -> AccessLevel
    def resolve_with_rule(self, requested_path: str) -> tuple[AccessLevel, PathRule | None]
    def invalidate_cache(self) -> None
```

### Resolution Rules

1. **Exact match** wins over glob match
2. **Longest glob match** wins over shorter
3. **Explicit `NONE`** always wins (safety override)
4. **Default** applies if no rule matches

### Glob Patterns

| Pattern | Matches |
|---|---|
| `/var/log/syslog` | Exact file |
| `/var/log/*` | Single level: `/var/log/syslog` (not `/var/log/nginx/access.log`) |
| `/var/log/**` | Recursive: `/var/log/nginx/access.log` |
| `/var/log` | Directory prefix: `/var/log` and everything under it |
| `/var/log/**/` | The directory itself and all descendants |

## AuditLogger

Structured JSON Lines audit logging. Thread-safe for concurrent writes.

```python
class AuditLogger:
    def __init__(self, log_path: str)
    def allowed(self, server: str, target_type: str, target: str, access: str = "", granted: str = "", tool: str = "")
    def denied(self, server: str, target_type: str, target: str, reason: str = "", required_access: str = "", granted_access: str = "", tool: str = "")
```

### Log Format

Each line is a JSON object:

```json
{"ts":"2026-07-19T08:30:00.123Z","result":"allowed","server":"ubuntu-mcp","target_type":"file","target":"/var/log/syslog","access":"read","granted":"read","tool":"read_file"}
```

### Reading Audit Logs

```python
from permission_engine import read_audit_log

# Get last 50 entries
entries = read_audit_log("/var/log/mcp/audit.log", limit=50)

# Get only denied entries
denied = read_audit_log("/var/log/mcp/audit.log", result_filter="denied")
```

## Models

### AccessLevel

```python
class AccessLevel(str, Enum):
    NONE = "none"    # Explicitly denied
    READ = "read"    # List, read, search
    WRITE = "write"  # Create, update, delete (implies read)

    def grants(self, required: AccessLevel) -> bool
```

### PathRule

```python
class PathRule(BaseModel):
    id: str           # Auto-generated (12-char hex)
    path: str         # Glob pattern (e.g., "/var/log/**")
    access: AccessLevel
    description: str | None
```

### CommandRule

```python
class CommandRule(BaseModel):
    id: str           # Auto-generated (12-char hex)
    pattern: str      # Glob pattern (e.g., "systemctl status *")
    access: AccessLevel
    description: str | None
```

### ServerConfig

```python
class ServerConfig(BaseModel):
    server: ServerInfo
    permissions: PermissionsConfig

class ServerInfo(BaseModel):
    name: str
    log_level: str = "INFO"
    audit_log: str = "/var/log/mcp/audit.log"

class PermissionsConfig(BaseModel):
    default_access: AccessLevel = AccessLevel.NONE
    paths: list[PathRule] = []
    commands: list[CommandRule] = []
    default_command_access: AccessLevel = AccessLevel.NONE
```

## Config YAML Reference

```yaml
server:
  name: "my-mcp"                              # Unique server identifier
  log_level: "INFO"                           # DEBUG | INFO | WARNING | ERROR
  audit_log: "/var/log/mcp/audit.log"        # JSON Lines audit file

permissions:
  default_access: "none"                      # none | read | write — when no rule matches
  paths:
    - id: "logs-readonly"                     # Auto-generated if omitted
      path: "/var/log/**"                     # Glob pattern
      access: "read"                          # none | read | write
      description: "Read access to all logs"  # Optional
    - id: "www-write"
      path: "/var/www/**"
      access: "write"
      description: "Full access to web root"
  commands:
    - id: "systemctl-status"
      pattern: "systemctl status *"           # Glob pattern
      access: "read"                          # Any non-none allows execution
      description: "Read-only systemd status"
    - id: "docker-ps"
      pattern: "docker ps*"
      access: "read"
  default_command_access: "none"              # Default when no command rule matches
```

## Environment Variable Substitution

Config values support `${VAR}` and `${VAR:-default}` syntax:

```yaml
paths:
  - path: "/home/${UBUNTU_SERVER_USER:-user}/**"
    access: "read"
```

## ForbiddenError

Raised by `check()` and `check_command()` when access is denied:

```python
class ForbiddenError(Exception):
    message: str        # Human-readable reason
    path: str | None    # The denied path (file checks)
    command: str | None # The denied command (command checks)
```

## Convenience Functions

```python
from permission_engine import load_config

config = load_config("/path/to/config.yaml")  # Returns ServerConfig
```
