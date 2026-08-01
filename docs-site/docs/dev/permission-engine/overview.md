---
sidebar_position: 1
---

# Permission Engine Overview

The permission engine (`mcp-permission-engine`) is a shared Python package that provides config-driven, default-deny access control for all MCP servers. It is the central security component of the entire stack.

## Design Goals

- **Default deny**: Nothing is accessible unless explicitly granted
- **Defense in depth**: Multiple independent check layers
- **Auditability**: Every decision logged as structured JSON
- **Hot reload**: Config changes take effect without restart
- **Reusability**: Same engine used identically across all MCP servers
- **Testability**: Pure functions with clear inputs and outputs

## Package Structure

```
mcp-permission-engine/src/permission_engine/
├── __init__.py      # Public API exports
├── models.py        # Pydantic v2 data models
├── config.py        # YAML loading with env var substitution
├── enforcer.py      # Core permission checks
├── resolver.py      # Path glob matching
├── audit.py         # JSON Lines audit logging
├── users.py         # User authentication
└── server.py        # BaseMCPServer abstract base class
```

## Public API

```python
from permission_engine import (
    # Base class for all MCP servers
    BaseMCPServer,

    # Core enforcer
    PermissionEnforcer,

    # Data models
    AccessLevel,
    PathRule,
    CommandRule,
    ToolRule,
    PermissionsConfig,
    ServerConfig,
    ProxyConfig,

    # Context variables
    _current_user_id,
    _observed_subagent_id,

    # Exceptions
    ForbiddenError,
)
```

## Three Enforcement Layers

The engine enforces access at three independent levels:

| Layer | Method | Applies To | Config Key |
|---|---|---|---|
| **User auth** | `authenticate()` | All requests | `users.yaml` |
| **Tool access** | `check_tool_access()` | All requests | `users.yaml` → `user.tools` |
| **Resource access** | `check()` | File paths | `permissions.paths` |
| **Command access** | `check_command()` | Shell commands | `permissions.commands` |
| **Tool access (proxy)** | `check_tool()` | API tools | `permissions.tools` |

All three layers must pass for a request to succeed. If any layer denies, the request is rejected and an audit entry is logged with the reason.

## Integration Pattern

Each MCP server creates a single `PermissionEnforcer` instance at startup:

```python
class UbuntuServer(BaseMCPServer):
    def __init__(self, config_path: str):
        super().__init__("ubuntu-mcp", config_path)
        # self.enforcer is now available
```

The base class handles:
- Loading the YAML config
- Creating the `PermissionEnforcer` instance
- Setting up hot reload
- Wrapping tool calls in `handle_tool_call()`
