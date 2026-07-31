---
sidebar_position: 2
---

# CasaOS Deployment

Deploy the MCP stack on [CasaOS](https://casaos.io/) using the dedicated `compose-casaos.yaml` file.

## What is CasaOS?

CasaOS is a simple, elegant home server OS with a web-based UI for managing Docker applications. The MCP stack includes a CasaOS-optimized Docker Compose file with GUI-friendly environment variable configuration.

## Differences from Standard Docker Compose

| Feature | `docker-compose.yml` | `compose-casaos.yaml` |
|---|---|---|
| Config paths | Relative (`./configs/`) | Absolute (`/DATA/AppData/mcp/configs/`) |
| Log paths | Relative (`${MCP_LOG_DIR}`) | Absolute (`/DATA/AppData/mcp/logs/`) |
| Env vars | `.env` file | CasaOS UI or inline |
| Metadata | None | `x-casaos` labels, descriptions, icon |
| Port mapping | Env var (`${WEBUI_PORT}`) | Hardcoded (`8280:8280`) |

## Setup

### 1. Create Directories

```bash
mkdir -p /DATA/AppData/mcp/configs
mkdir -p /DATA/AppData/mcp/logs/{ubuntu,obsidian,synology,github}
```

### 2. Copy Config Templates

```bash
cp configs/templates/users.yaml /DATA/AppData/mcp/configs/
cp configs/templates/ubuntu-server.yaml /DATA/AppData/mcp/configs/
cp configs/templates/obsidian.yaml /DATA/AppData/mcp/configs/
cp configs/templates/synology-nas.yaml /DATA/AppData/mcp/configs/
cp configs/templates/github-mcp.yaml /DATA/AppData/mcp/configs/
```

### 3. Generate Secrets

```bash
WEBUI_API_KEY=$(openssl rand -hex 32)
WEBUI_AUTH_SECRET=$(openssl rand -hex 32)
echo "API Key: $WEBUI_API_KEY"
echo "Auth Secret: $WEBUI_AUTH_SECRET"
```

### 4. Deploy

In CasaOS:
1. Go to App Store → "Import via Docker Compose"
2. Paste the contents of `compose-casaos.yaml`
3. Fill in environment variables in the CasaOS UI
4. Click "Install"

Or deploy from the command line:

```bash
docker compose -f compose-casaos.yaml up -d --build
```

### 5. Access

Navigate to `http://<casaos-server>:8280` and log in with the `WEBUI_API_KEY`.

## Environment Variables

The CasaOS Compose file defines the same variables as the standard one, but with descriptions shown in the CasaOS UI. Fill in:

- **Server connectivity**: `UBUNTU_SERVER_HOST`, `UBUNTU_SERVER_USER`
- **NAS credentials**: `SYNOLOGY_NAS_HOST`, `SYNOLOGY_NAS_PORT`, `SYNOLOGY_NAS_USER`, `SYNOLOGY_NAS_PASSWORD`, `SYNOLOGY_NAS_OTP_SECRET`
- **Web UI auth**: `WEBUI_API_KEY`, `WEBUI_AUTH_SECRET`
- **Vault path**: `OBSIDIAN_VAULT_PATH`
- **GitHub token**: `GITHUB_PERSONAL_ACCESS_TOKEN`
