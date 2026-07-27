---
sidebar_position: 1
---

# System Design

The MCP Server Suite is a distributed system where Claude Code on a local machine communicates with MCP servers running in Docker containers on a remote Ubuntu host. This page describes the overall architecture and design decisions.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Local Machine (Mac)                        │
│                                                                     │
│  ┌──────────────┐     ~/.claude/settings.json                      │
│  │  Claude Code  │     defines MCP server connections               │
│  └──────┬───────┘                                                   │
│         │ JSON-RPC over stdio                                       │
│         │ (via SSH)                                                 │
└─────────┼───────────────────────────────────────────────────────────┘
          │
    Cloudflare Tunnel (TLS)
          │
┌─────────┼───────────────────────────────────────────────────────────┐
│         ▼                    Ubuntu Server                          │
│  ┌──────────────┐                                                   │
│  │   SSH daemon  │                                                  │
│  └──────┬───────┘                                                   │
│         │ docker exec -i                                            │
│         │                                                            │
│  ┌──────▼──────────────────────────────────────────────────────┐   │
│  │                 Docker Containers                             │   │
│  │                                                               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│  │  │ ubuntu-  │ │ obsidian-│ │ synology-│ │ github-  │       │   │
│  │  │ mcp      │ │ mcp      │ │ mcp      │ │ mcp      │       │   │
│  │  │          │ │          │ │          │ │          │       │   │
│  │  │ Python   │ │ Python   │ │ Python   │ │ Python   │       │   │
│  │  │ stdio    │ │ stdio    │ │ stdio    │ │ stdio    │       │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │   │
│  │       │             │             │             │            │   │
│  │       └─────────────┼─────────────┼─────────────┘            │   │
│  │                     │             │                          │   │
│  │          ┌──────────▼─────────────▼──────────┐              │   │
│  │          │     Permission Engine              │              │   │
│  │          │  (shared lib, per-instance)        │              │   │
│  │          └───────────────────────────────────┘              │   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐                          │   │
│  │  │  mcp-webui   │  │  docs-site   │                          │   │
│  │  │  Next.js 15  │  │  Docusaurus   │                          │   │
│  │  │  port 8280   │  │  port 3000   │                          │   │
│  │  └──────────────┘  └──────────────┘                          │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Host Filesystem:                                                    │
│  ├── configs/*.yaml (read/write by Web UI, read by MCP servers)      │
│  ├── /var/log/mcp/*/audit.log (written by MCP, read by Web UI)      │
│  └── /DATA/obsidian-vaults/ (mounted into obsidian-mcp)             │
└─────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Why stdio instead of HTTP?

MCP servers communicate over stdio (standard input/output) rather than HTTP. This decision was made because:

- **No network attack surface**: MCP servers don't listen on any ports — they can't be scanned or attacked over the network
- **SSH-native**: Claude Code connects via SSH, which already provides authentication and encryption. Piping `docker exec -i` through SSH is natural with stdio
- **Simplicity**: No HTTP framework, no TLS certificates, no port management needed for MCP servers
- **Process lifecycle**: The MCP process is spawned on demand and exits when the connection closes

The Web UI is the exception: it uses HTTP (Next.js) because it serves a browser-based UI.

### Why Docker?

Each MCP server runs in its own Docker container:

- **Dependency isolation**: Python 3.12 with specific package versions per server
- **Filesystem boundaries**: Volume mounts control exactly which host paths are visible
- **Process isolation**: `pid: host` for Ubuntu MCP (needs process table), bridge networking for others
- **Reproducibility**: Same image runs identically in dev and production

### Why a Shared Permission Engine?

The permission engine (`mcp-permission-engine`) is a shared Python package copied into each MCP server's build context. This avoids:

- A separate microservice that would be a single point of failure
- Network latency for every permission check
- Complex service discovery

Each MCP server has its own instance of the engine, loaded with its own config. Changes are propagated via the filesystem: the Web UI writes YAML, each server's `watchfiles` detects the change and reloads.

### Why YAML for Config?

YAML was chosen over JSON for configuration because:

- Comments are supported (critical for documenting why a rule exists)
- More readable for nested permission rules
- Multi-line strings for descriptions
- Environment variable substitution (`!ENV` tags) for secrets
