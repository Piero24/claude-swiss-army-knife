# Quickstart

Claude Swiss Army Knife — MCP servers (Ubuntu, Obsidian, Synology NAS) + permission Web UI, all in Docker on an Ubuntu host.

## Prerequisites

- Docker + Docker Compose on the Ubuntu server
- SSH key access from your Mac to the server
- Synology DSM 7.x with File Station API enabled (for NAS MCP)

## 1. Configure

```bash
git clone git@github.com:Piero24/claude-swiss-army-knife.git
cd claude-swiss-army-knife
cp .env.example .env
# Edit .env — set your server host, NAS creds, vault paths
bash scripts/generate-api-key.sh    # copy output to .env as WEBUI_API_KEY
# Also set WEBUI_AUTH_SECRET: openssl rand -hex 32
bash scripts/setup-build.sh        # copy shared lib into each build context
```

## 2. Launch

```bash
docker compose up -d --build
bash scripts/health-check.sh
```

This starts 7 containers: `ubuntu-mcp`, `obsidian-mcp`, `synology-mcp`, `mcp-webui`, `docs-site`, `obsidian-livesync`, `obsidian`.

## 3. Interact

### Web UI (permission manager)
```
http://<your-server>:8280
```
Log in with the `WEBUI_API_KEY` from step 1. Toggle path/command permissions per server via GUI instead of editing YAML.

### Connect Claude Code
Add to `~/.claude/settings.json` on your **local Mac**:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": ["<your-server>", "docker", "exec", "-i", "ubuntu-mcp", "python", "-m", "ubuntu_mcp"]
    },
    "obsidian": {
      "command": "ssh",
      "args": ["<your-server>", "docker", "exec", "-i", "obsidian-mcp", "python", "-m", "obsidian_mcp"]
    },
    "synology-nas": {
      "command": "ssh",
      "args": ["<your-server>", "docker", "exec", "-i", "synology-mcp", "python", "-m", "synology_mcp"]
    }
  }
}
```

MCP servers communicate over stdio — no ports exposed. Claude Code SSHes into the server and pipes `docker exec -i` to talk to each container.

### Docs site
```
http://<your-server>:3000
```

## Useful commands

```bash
docker compose logs -f <service>        # tail logs for one service
docker compose up -d --build <service>  # rebuild a single service
docker compose down                     # stop everything
bash scripts/health-check.sh            # check all container statuses
```

## Edit permissions

Edit YAML directly in `configs/<server>.yaml`, or use the Web UI. Changes are picked up live — no restart needed.
