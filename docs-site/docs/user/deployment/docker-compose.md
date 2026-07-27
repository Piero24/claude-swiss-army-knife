---
sidebar_position: 1
---

# Docker Compose Deployment

Deploy the full MCP stack using the root `docker-compose.yml` file. All eight services are defined and configured through a single command.

## Service Architecture

The Compose file defines the following services:

| Service | Image | Network | Key Mounts |
|---|---|---|---|
| `ubuntu-mcp` | `ubuntu-mcp:latest` | host | `/home`, `/var/www`, `/var/log`, `/etc/nginx`, Docker socket |
| `obsidian-mcp` | `obsidian-mcp:latest` | bridge | Vault data at `/data/vaults` |
| `synology-mcp` | `synology-mcp:latest` | bridge | Config only (NAS accessed over network) |
| `github-mcp` | `github-mcp:latest` | bridge | Config only (GitHub API accessed over internet) |
| `mcp-webui` | `mcp-webui:latest` | bridge (port 8280) | Configs (rw), audit logs (ro), Docker socket (ro) |
| `docs-site` | Docusaurus build | bridge (port 3000) | None (static build) |

## Deployment Steps

### 1. Clone and Configure

```bash
git clone git@github.com:Piero24/claude-swiss-army-knife.git
cd claude-swiss-army-knife
cp .env.example .env
# Edit .env with your values
```

### 2. Generate Secrets

```bash
bash scripts/generate-api-key.sh
openssl rand -hex 32  # for WEBUI_AUTH_SECRET
# Add both to .env
```

### 3. Copy Shared Libraries

Docker cannot `COPY` files from outside the build context. The setup script copies shared libraries into each server's build directory:

```bash
bash scripts/setup-build.sh
```

This copies:
- `mcp-permission-engine/` → each MCP server's build context
- `mcp-proxy/` → the GitHub MCP build context

### 4. Start Services

```bash
docker compose up -d --build
```

### 5. Verify

```bash
bash scripts/health-check.sh
```

All services should show `running`.

## Service Details

### ubuntu-mcp

- `network_mode: host` — Direct access to host networking for Docker socket and systemd
- `pid: host` — Access to host process table for `ps` and process monitoring
- `stdin_open: true` — Required for MCP stdio communication

### obsidian-mcp

- Mounts vault as read-write at `/data/vaults`
- Config mounted as read-only via `:ro` flag — the server detects changes via `watchfiles`

### synology-mcp

- NAS credentials passed as environment variables
- No local filesystem access needed — all operations via DSM API

### mcp-webui

- Exposes port 8280 on the host
- Mounts `configs/` directory as read-write to write YAML changes
- Mounts `/var/log/mcp` as read-only to read audit logs
- Mounts Docker socket as read-only to check container health

## Updating Services

After pulling changes from git:

```bash
git pull
bash scripts/setup-build.sh        # Re-copy shared libs
docker compose up -d --build       # Rebuild and restart changed services
```

To update a single service:

```bash
docker compose up -d --build ubuntu-mcp
```

## Stopping Services

```bash
docker compose down                # Stop all containers, keep volumes
docker compose down -v             # Stop and remove volumes (destroys data)
```
