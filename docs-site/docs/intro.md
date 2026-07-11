---
sidebar_position: 1
---

# MCP Server Suite

Professional MCP (Model Context Protocol) servers for managing your infrastructure via Claude Code.

## What This Is

Three MCP servers running as Docker containers on your Ubuntu server, plus a web UI for permission management:

- **Ubuntu Server MCP** — File I/O, command execution, Docker management, systemd service control, system monitoring
- **Obsidian MCP** — Read/write/search notes in your Obsidian vault (synced via Live Sync)
- **Synology NAS MCP** — File management on your Synology NAS via DSM 7.x API
- **Permission Web UI** — Toggle which paths and commands each MCP can access
- **Shared Permission Engine** — Config-driven, default-deny, audit-logged access control

## How It Works

```
Claude Code (your Mac) → Cloudflare Tunnel → SSH → docker exec → MCP Server (Ubuntu)
```

All MCP servers run in Docker containers on your Ubuntu server. Claude Code connects via SSH over Cloudflare Tunnel and spawns the MCP process inside the container using `docker exec`. No new ports, no VPN toggle needed.

## Key Principles

- **Default deny** — nothing is accessible unless explicitly granted
- **Granular permissions** — control read/write access per folder and per command
- **Full audit trail** — every access attempt is logged
- **Hot reload** — permission changes take effect in under 1 second, no restart

## Next Steps

Read the [Getting Started guide](/getting-started/installation) to set up your own instance.
