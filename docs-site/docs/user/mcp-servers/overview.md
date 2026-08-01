---
sidebar_position: 1
---

# MCP Servers Overview

Four professional-grade MCP servers, each purpose-built for a specific infrastructure domain. All share the same permission engine and can be managed through a single Web UI.

## Server Comparison

| Server | Protocol | Tools | Auth | Permission Layer |
|---|---|---|---|---|
| **Ubuntu MCP** | stdio (local) | 12 | User key (optional) | Path + Command rules |
| **Obsidian MCP** | stdio (local) | 9 | User key (optional) | Path rules |
| **Synology NAS MCP** | stdio + DSM API | 9 | User key (optional) + DSM login | Path + Command rules |
| **GitHub MCP** | stdio (proxy) | 20+ | User key (optional) + GitHub PAT | Tool rules |

## How MCP Communication Works

```
Claude Code                    SSH Tunnel                  Docker Container
     │                             │                             │
     ├── JSON-RPC request ────────▶│── docker exec -i ──────────▶│
     │   {"method":"tools/call",   │   python -m ubuntu_mcp      │
     │    "params":{...}}          │                             │
     │                             │                             │
     │                             │   ┌─────────────────────┐   │
     │                             │   │ PermissionEnforcer  │   │
     │                             │   │  check() /          │   │
     │                             │   │  check_command()    │   │
     │                             │   └─────────┬───────────┘   │
     │                             │             │               │
     │                             │   ┌─────────▼───────────┐   │
     │                             │   │ Tool handler        │   │
     │                             │   │ (read, write, exec) │   │
     │                             │   └─────────┬───────────┘   │
     │                             │             │               │
     │◀── JSON-RPC response ───────│◀─ stdout ──────────────────│
     │   {"result":{...}}          │                             │
```

Every tool call goes through three layers:
1. **User authentication**: Validate `MCP_USER_ID` / `MCP_USER_KEY` against `users.yaml`
2. **Tool access check**: Verify the user is allowed to use this specific tool
3. **Permission check**: Validate the specific path, command, or tool against the YAML rules

All decisions are logged to the audit trail.

## Common Architecture

Each MCP server follows the same pattern:

- **Base class**: `BaseMCPServer` from the shared permission engine
- **Transport**: stdio JSON-RPC (MCP protocol)
- **Configuration**: YAML file mounted at `/app/config.yaml`
- **Hot reload**: Config changes detected via `watchfiles` and applied without restart
- **Audit**: All access decisions logged as JSON Lines to `/var/log/mcp/audit.log`
- **Deployment**: Docker container with `stdin_open: true` and config mounted as volume

## Permission Model

All servers share the same permission engine with three rule types:

| Rule Type | Used By | Pattern Example | Access Levels |
|---|---|---|---|
| **Path rules** | Ubuntu, Obsidian, Synology | `/var/log/**` | `none`, `read`, `write` |
| **Command rules** | Ubuntu, Synology | `systemctl status *` | `none`, `active` |
| **Tool rules** | GitHub (proxy servers) | `search_repositories` | `none`, `active` |

Default access is always `none`: everything must be explicitly granted.

## Choosing Which Server to Use

- **Ubuntu MCP**: Managing files, services, and Docker on your Ubuntu host
- **Obsidian MCP**: Reading and writing notes in your Obsidian vault
- **Synology NAS MCP**: File operations on a Synology NAS (list, read, write, move, delete)
- **GitHub MCP**: GitHub API access (search repos, read issues, create PRs) with tool-level gating

You can run all four simultaneously: each is an independent Docker container with its own permission config.
