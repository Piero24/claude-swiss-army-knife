---
sidebar_position: 1
---

# Web UI Overview

The MCP Web UI is a Next.js 15 application that provides a graphical interface for managing all MCP server permissions. Instead of editing YAML files by hand, you can toggle permissions, manage users, and browse audit logs through a dashboard.

![Web UI Dashboard](/img/screenshots/dashboard.png)

## Architecture

The Web UI runs as a Docker container alongside the MCP servers. It reads and writes YAML configuration files directly on the host filesystem, and reads audit log files from the shared log directory. Changes take effect in real time: MCP servers detect config file changes via `watchfiles` and reload within 1 second.

```
Browser ──HTTPS──▶ Cloudflare Tunnel ──▶ mcp-webui (port 8280)
                                              │
                            ┌─────────────────┼─────────────────┐
                            ▼                 ▼                  ▼
                    configs/*.yaml    /var/log/mcp/*     /var/run/docker.sock
                    (read/write)      (read-only)        (container status)
```

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Server status cards, health indicators, bulk enable/disable, usage statistics |
| **Server Config** | Per-server path tree, command rules, tool rules with access toggles |
| **Folder Scanning** | Auto-discover folder structures and add permission rules in bulk |
| **Agent Management** | Manage users, access modes (open/allowlist/blocklist), SSH key generation |
| **Audit Log Viewer** | Filter, paginate, and inspect every access decision |
| **Settings** | Configure scan intervals, UI section visibility, page sizes |
| **Usage Stats** | Request counts by server, tool, user, and date range |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Charts | Recharts v3 |
| Auth | iron-session (encrypted cookies) |
| Config | js-yaml |
| Notifications | sonner (toast) |

## Accessing the Web UI

Navigate to `http://<your-server>:8280` and log in with your `WEBUI_API_KEY` from `.env`.

For secure remote access, route through Cloudflare Tunnel. See [Cloudflare Tunnel](/user/deployment/cloudflare-tunnel) for setup instructions.

## Pages

| Page | Route | Purpose |
|---|---|---|
| Login | `/login` | API key authentication |
| Dashboard | `/` | Server overview, health, stats |
| Server Detail | `/<server>` | Path/command/tool permissions |
| Agents | `/agents` | User management |
| Settings | `/settings` | App configuration |
