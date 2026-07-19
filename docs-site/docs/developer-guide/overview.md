---
sidebar_position: 1
---

# Developer Guide

Everything you need to create new MCP servers or integrate existing ones into the Swiss Army Knife suite.

## What You'll Learn

- **Creating a new MCP server**: Project structure, permission engine integration, Docker setup
- **Adding an existing MCP**: How to wrap non-Python MCPs, config integration, Web UI hooks
- **Permission engine API**: `PermissionEnforcer`, `PathResolver`, `AuditLogger`, config YAML reference

## Architecture

Every MCP server in this suite follows the same pattern:

```
mcp-servers/<name>/
├── Dockerfile              # Container image
├── pyproject.toml          # Python package metadata + deps
├── src/<name>_mcp/
│   ├── __init__.py
│   ├── __main__.py         # Entry point: python -m <name>_mcp
│   ├── server.py           # MCP server (stdio transport)
│   ├── config_watcher.py   # Hot-reload watcher for config changes
│   └── tools/              # MCP tool implementations
│       └── __init__.py
└── tests/
    └── test_smoke.py
```

The **shared permission engine** (`mcp-servers/shared/mcp-permission-engine/`) provides config-driven access control used by every server. It is copied into each server's build context during Docker build.

## Key Concepts

| Concept | Description |
|---|---|
| **Permission Engine** | Pydantic-validated YAML config → glob-based path matching + command allowlisting |
| **Default Deny** | All access is denied unless explicitly granted in the config YAML |
| **Audit Logging** | Every access decision (allow/deny) is logged as structured JSON Lines |
| **Hot Reload** | Config changes are picked up within seconds via filesystem watchers |
| **Stdio Transport** | All MCP servers communicate via stdin/stdout (standard MCP protocol) |
