---
sidebar_position: 1
---

# Claude Swiss Army Knife — MCP Server Suite

Professional-grade MCP (Model Context Protocol) servers for managing your infrastructure through Claude Code. Give Claude safe, audited, and granular access to your Ubuntu servers, Obsidian vaults, Synology NAS devices, and GitHub — all from a single, permission-gated platform.

## What This Is

A suite of five integrated components running in Docker on your Ubuntu server:

| Component | Tech | Purpose |
|---|---|---|
| **Ubuntu Server MCP** | Python 3.12 | Manage Ubuntu host: file I/O, commands, Docker, systemd |
| **Obsidian MCP** | Python 3.12 | Read, write, and search your Obsidian vault notes |
| **Synology NAS MCP** | Python 3.12 | Manage Synology NAS files and system via DSM 7.x API |
| **GitHub MCP** | Python 3.12 | GitHub API access with tool-level permission gating |
| **Permission Web UI** | Next.js 15 / TypeScript | Graphical interface for managing all permissions |
| **Shared Permission Engine** | Python (shared lib) | Config-driven, default-deny, audit-logged access control |

## Architecture Overview

```
┌──────────────┐     SSH + Cloudflare Tunnel     ┌─────────────────────────────┐
│  Claude Code │ ───────────────────────────────▶ │      Ubuntu Server          │
│  (your Mac)  │                                  │                             │
└──────────────┘                                  │  ┌───────────────────────┐  │
                                                  │  │   ubuntu-mcp          │  │
                                                  │  │   (Python, stdio)     │  │
                                                  │  └───────┬───────────────┘  │
                                                  │          │                  │
                                                  │  ┌───────▼───────────────┐  │
                                                  │  │  Permission Engine     │  │
                                                  │  │  (default-deny, audit) │  │
                                                  │  └───────────────────────┘  │
                                                  │                             │
                                                  │  ┌───────────────────────┐  │
                                                  │  │   mcp-webui            │  │
                                                  │  │   (port 8280)          │  │
                                                  │  └───────────────────────┘  │
                                                  └─────────────────────────────┘
```

All MCP servers run in Docker containers and communicate over **stdio** — no network ports are exposed for MCP traffic. Claude Code connects via SSH (optionally over Cloudflare Tunnel) and pipes `docker exec -i` to talk to each container. The Web UI runs on port 8280 behind Cloudflare Tunnel with API key authentication.

## Key Principles

- **Default deny**: Nothing is accessible unless explicitly granted. Every file path, shell command, and API tool must be allowlisted.
- **Granular permissions**: Control read/write access per folder, per command pattern, and per tool — for each user.
- **Full audit trail**: Every access decision (allow and deny) is logged with structured JSON, including timestamps, user IDs, and reasons.
- **Hot reload**: Permission changes take effect in under 1 second. No restart needed.
- **Multi-user**: Three access modes (open, allowlist, blocklist) with per-user tool restrictions and SHA-256 key authentication.

## What You Can Do

- **Manage servers**: Read logs, edit configs, restart services, check system health — all through Claude Code conversations.
- **Work with notes**: Search your Obsidian vault, create daily notes, find backlinks, organize by tags — without leaving your editor.
- **Handle NAS files**: List, move, upload, and delete files on your Synology NAS through natural language requests.
- **Interact with GitHub**: Search repos, read issues, create PRs — with tool-level restrictions preventing destructive actions.
- **Control access**: Manage who can do what through a graphical Web UI, with instant updates and full visibility.

## Quick Start

```bash
# 1. Clone and configure
git clone git@github.com:Piero24/claude-swiss-army-knife.git
cd claude-swiss-army-knife
cp .env.example .env
# Edit .env with your server IPs, credentials, and paths

# 2. Generate API key for the Web UI
bash scripts/generate-api-key.sh

# 3. Start everything
docker compose up -d --build

# 4. Check health
bash scripts/health-check.sh
```

See the [Installation guide](/user/getting-started/installation) for detailed step-by-step instructions.

## Next Steps

- **New user?** Start with [Getting Started](/user/getting-started/installation) to set up your own instance.
- **Already running?** Dive into the [MCP Servers reference](/user/mcp-servers/overview) for tool documentation.
- **Developer?** Read the [Architecture overview](/dev/architecture/system-design) to understand the internals.

## Requirements

- Docker + Docker Compose on an Ubuntu server
- Python 3.12+ (in containers)
- Node.js 22+ (in containers)
- Cloudflare Tunnel (recommended for secure remote access)
- Synology DSM 7.x with File Station API enabled (for NAS MCP)
- GitHub personal access token (for GitHub MCP)

## License

MIT — see [LICENSE](https://github.com/Piero24/claude-swiss-army-knife/blob/main/LICENSE) for details.
