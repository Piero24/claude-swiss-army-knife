---
sidebar_position: 2
---

# Installation

Step-by-step guide to install and configure the MCP Server Suite on your Ubuntu server.

## 1. Clone the Repository

```bash
git clone git@github.com:Piero24/claude-swiss-army-knife.git
cd claude-swiss-army-knife
```

All subsequent commands are run from this directory.

## 2. Configure Environment

Copy the example environment file and edit it with your values:

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in:

- `UBUNTU_SERVER_HOST`: Your server's hostname or IP
- `UBUNTU_SERVER_USER`: Your SSH username
- `SYNOLOGY_NAS_*`: NAS credentials (if using Synology MCP)
- `OBSIDIAN_VAULT_PATH`: Path to your vault (if using Obsidian MCP)
- `GITHUB_TOKEN`: GitHub personal access token (if using GitHub MCP)

See the [Configuration Reference](/user/getting-started/configuration) for every variable.

## 3. Generate Secrets

**API Key** for Web UI login:

```bash
bash scripts/generate-api-key.sh
```

Copy the output into `.env` as `WEBUI_API_KEY`.

**Auth Secret** for session encryption:

```bash
openssl rand -hex 32
```

Copy the output into `.env` as `WEBUI_AUTH_SECRET`.

## 4. Prepare Config Files

Copy the permission configuration templates:

```bash
# Copy templates to configs directory
cp configs/templates/ubuntu-server.yaml configs/
cp configs/templates/obsidian.yaml configs/
cp configs/templates/synology-nas.yaml configs/
cp configs/templates/github-mcp.yaml configs/
cp configs/templates/users.yaml configs/
```

Edit each YAML file to define your access rules. Start with read-only paths and minimal command access, then expand as needed.

**Minimal ubuntu-server.yaml example:**

```yaml
server:
  name: ubuntu-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: none
  paths:
    - path: /var/log/**
      access: read
      description: "Read access to all logs"
  commands:
    - pattern: "systemctl status *"
      access: active
      description: "Check service status"
    - pattern: "docker ps*"
      access: active
      description: "List Docker containers"
  default_command_access: none
```

## 5. Build and Launch

Copy the shared libraries into each MCP server's build context:

```bash
bash scripts/setup-build.sh
```

This is required because Docker cannot `COPY` files from outside the build context. The script copies the shared permission engine and proxy libraries into each server's directory before building.

Start all services:

```bash
docker compose up -d --build
```

This command:
1. Builds Docker images for all 8 services
2. Creates and starts containers in detached mode (`-d`)
3. Mounts volumes for configs, logs, and data directories
4. Sets up the network and port mappings

The first build may take 2 to 5 minutes depending on your server's speed and network.

## 6. Verify

Run the health check:

```bash
bash scripts/health-check.sh
```

All services should show `running`. See [Verifying the Installation](/user/getting-started/verifying) for detailed verification steps and troubleshooting.

## 7. Log Into Web UI

Navigate to `http://<your-server>:8280` and log in with the `WEBUI_API_KEY` you generated in step 3.

The dashboard should show all server cards with their health status.

## Next Steps

- [Connect Claude Code](/user/getting-started/claude-code-setup) to start using MCP servers
- [Configure permissions](/user/security/permissions) to control access
- Explore the [Web UI guide](/user/webui/overview) for managing everything graphically
