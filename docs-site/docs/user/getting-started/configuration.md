---
sidebar_position: 3
---

# Configuration Reference (.env)

Every aspect of the MCP stack is controlled through the `.env` file. Copy `.env.example` to `.env` and fill in your values.

## Server Connectivity

| Variable | Required | Default | Description |
|---|---|---|---|
| `UBUNTU_SERVER_HOST` | Yes | — | Hostname or IP of your Ubuntu server |
| `UBUNTU_SERVER_SSH_PORT` | No | `22` | SSH port on the server |
| `UBUNTU_SERVER_USER` | Yes | — | SSH username for connecting |

**Example:**
```bash
UBUNTU_SERVER_HOST=myserver.example.com
UBUNTU_SERVER_SSH_PORT=22
UBUNTU_SERVER_USER=alice
```

## Container Names

| Variable | Required | Default | Description |
|---|---|---|---|
| `UBUNTU_MCP_CONTAINER` | No | `ubuntu-mcp` | Docker container name for Ubuntu MCP |
| `OBSIDIAN_MCP_CONTAINER` | No | `obsidian-mcp` | Docker container name for Obsidian MCP |
| `SYNOLOGY_MCP_CONTAINER` | No | `synology-mcp` | Docker container name for Synology MCP |
| `GITHUB_MCP_CONTAINER` | No | `github-mcp` | Docker container name for GitHub MCP |

## Synology NAS (DSM 7.x)

These variables configure the Synology MCP connection. The NAS must be on the same LAN as the Ubuntu server or reachable over the network.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SYNOLOGY_NAS_HOST` | Yes | `192.168.1.100` | IP address or hostname of your Synology NAS |
| `SYNOLOGY_NAS_PORT` | No | `5001` | DSM HTTPS port |
| `SYNOLOGY_NAS_USER` | Yes | — | DSM login username |
| `SYNOLOGY_NAS_PASSWORD` | Yes | — | DSM login password |
| `SYNOLOGY_NAS_OTP_SECRET` | No | — | Base32 TOTP secret if 2FA is enabled. Copy only the `secret=` value from your `otpauth://` URL. Leave empty if 2FA is disabled. |

**Example:**
```bash
SYNOLOGY_NAS_HOST=192.168.1.100
SYNOLOGY_NAS_PORT=5001
SYNOLOGY_NAS_USER=admin
SYNOLOGY_NAS_PASSWORD=your-secure-password
SYNOLOGY_NAS_OTP_SECRET=JBSWY3DPEHPK3PXP
```

## Obsidian

| Variable | Required | Default | Description |
|---|---|---|---|
| `OBSIDIAN_VAULT_PATH` | Yes | — | Path to your Obsidian vault on the host. Mounted read-write so the MCP can read and edit notes. |
| `OBSIDIAN_LIVESYNC_DATA` | No | — | Path to Obsidian Live Sync CouchDB data (if using Live Sync). |

**Example:**
```bash
OBSIDIAN_VAULT_PATH=/DATA/obsidian-vaults/personal
OBSIDIAN_LIVESYNC_DATA=/DATA/AppData/big-bear-obsidian-livesync/data
```

## Web UI

| Variable | Required | Default | Description |
|---|---|---|---|
| `WEBUI_API_KEY` | Yes | — | API key for Web UI login. Generate with `bash scripts/generate-api-key.sh`. Must be a strong random 64-char hex string. |
| `WEBUI_AUTH_SECRET` | Yes | — | Session encryption secret. Generate with `openssl rand -hex 32`. |
| `WEBUI_PORT` | No | `8280` | Host port for the Web UI. |
| `WEBUI_IMAGE_TAG` | No | `latest` | Docker image tag for the Web UI. |

**Generating secrets:**
```bash
# Generate API key
bash scripts/generate-api-key.sh

# Generate auth secret
openssl rand -hex 32
```

Copy both outputs into your `.env` file.

## Documentation Site

| Variable | Required | Default | Description |
|---|---|---|---|
| `DOCS_PORT` | No | `3000` | Host port for the Docusaurus docs site. |
| `DOCS_IMAGE_TAG` | No | `latest` | Docker image tag for the docs site. |

## Docker Image Tags

| Variable | Required | Default | Description |
|---|---|---|---|
| `UBUNTU_MCP_IMAGE_TAG` | No | `latest` | Tag for Ubuntu MCP image |
| `OBSIDIAN_MCP_IMAGE_TAG` | No | `latest` | Tag for Obsidian MCP image |
| `SYNOLOGY_MCP_IMAGE_TAG` | No | `latest` | Tag for Synology MCP image |
| `GITHUB_MCP_IMAGE_TAG` | No | `latest` | Tag for GitHub MCP image |

For production, pin specific version tags instead of `latest`.

## External MCP Tokens

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | No | — | GitHub personal access token. Create at GitHub → Settings → Developer settings → Personal access tokens. Required for GitHub MCP functionality. |

## Logging

| Variable | Required | Default | Description |
|---|---|---|---|
| `MCP_LOG_DIR` | No | `/var/log/mcp` | Directory for MCP audit and application logs. Subdirectories are created per server (ubuntu, obsidian, synology, github). |
| `MCP_LOG_LEVEL` | No | `INFO` | Log level for all MCP servers. Options: `DEBUG`, `INFO`, `WARNING`, `ERROR`. |

**Example:**
```bash
MCP_LOG_DIR=/var/log/mcp
MCP_LOG_LEVEL=INFO
```

## Full Example

```bash
# Server Connectivity
UBUNTU_SERVER_HOST=myserver.example.com
UBUNTU_SERVER_SSH_PORT=22
UBUNTU_SERVER_USER=alice

# Synology NAS
SYNOLOGY_NAS_HOST=192.168.1.100
SYNOLOGY_NAS_PORT=5001
SYNOLOGY_NAS_USER=admin
SYNOLOGY_NAS_PASSWORD=secure-password-here
SYNOLOGY_NAS_OTP_SECRET=

# Obsidian
OBSIDIAN_VAULT_PATH=/DATA/obsidian-vaults/personal
OBSIDIAN_LIVESYNC_DATA=/DATA/AppData/big-bear-obsidian-livesync/data

# Web UI
WEBUI_API_KEY=a1b2c3d4e5f6...64-char-hex
WEBUI_AUTH_SECRET=f7e8d9c0...32-byte-hex
WEBUI_PORT=8280

# Docs
DOCS_PORT=3000

# Docker Tags
UBUNTU_MCP_IMAGE_TAG=latest
OBSIDIAN_MCP_IMAGE_TAG=latest
SYNOLOGY_MCP_IMAGE_TAG=latest
GITHUB_MCP_IMAGE_TAG=latest

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Logging
MCP_LOG_DIR=/var/log/mcp
MCP_LOG_LEVEL=INFO
```
