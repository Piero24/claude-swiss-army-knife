# Claude Swiss Army Knife — MCP Server Suite

Professional-grade MCP servers for managing your infrastructure via Claude Code.

## What's Included

| Component | Tech | Purpose |
|---|---|---|
| **Ubuntu Server MCP** | Python 3.12 | Manage Ubuntu host — files, commands, Docker, systemd |
| **Obsidian MCP** | Python 3.12 | Read/write/search Obsidian vault notes |
| **Synology NAS MCP** | Python 3.12 | Manage Synology NAS via DSM 7.x API |
| **Permission Web UI** | Next.js 15 / TypeScript | Toggle permissions per path/command with a GUI |
| **Documentation** | Docusaurus 3 | Full architecture, setup, and API docs |
| **Permission Engine** | Python (shared lib) | Config-driven access control for all MCPs |

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

## Connecting Claude Code

Add to `~/.claude/settings.json` on your local Mac:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": ["your-server.example.com", "docker", "exec", "-i", "ubuntu-mcp", "python", "-m", "ubuntu_mcp"]
    },
    "obsidian": {
      "command": "ssh",
      "args": ["your-server.example.com", "docker", "exec", "-i", "obsidian-mcp", "python", "-m", "obsidian_mcp"]
    },
    "synology-nas": {
      "command": "ssh",
      "args": ["your-server.example.com", "docker", "exec", "-i", "synology-mcp", "python", "-m", "synology_mcp"]
    }
  }
}
```

## Permission Model

All access is **denied by default**. You explicitly grant access:

```yaml
# configs/ubuntu-server.yaml
permissions:
  default_access: none
  paths:
    - path: /var/log/**
      access: read
    - path: /var/www/**
      access: write
  commands:
    - pattern: "systemctl status *"
      access: read
    - pattern: "systemctl restart nginx"
      access: write
```

Use the **Web UI** at `http://your-server:8280` to manage permissions via toggles instead of editing YAML.

## Project Structure

```
├── docker-compose.yml          # All services
├── .env.example                # Config template
├── mcp-servers/
│   ├── shared/permission-engine/
│   ├── ubuntu-server/
│   ├── obsidian/
│   └── synology-nas/
├── mcp-webui/                  # Next.js permission manager
├── docs-site/                  # Docusaurus docs
├── configs/                    # MCP permission YAML files
└── scripts/                    # Utilities
```

## Security

- All traffic through Cloudflare Tunnel (zero open ports)
- SSH key-only authentication
- Default-deny permission model
- Path traversal and command injection prevention
- Structured JSON audit logging
- API key authentication for Web UI

## Requirements

- Docker + Docker Compose on the Ubuntu server
- Python 3.12+ (in containers)
- Node.js 22+ (in containers)
- Cloudflare Tunnel (already set up)
- Synology DSM 7.x with File Station API enabled

## License

MIT
