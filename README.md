<p align="center">
  <img src="https://raw.githubusercontent.com/Piero24/claude-swiss-army-knife/main/.github/images/logo/MCP_Stack.png" alt="MCP Stack" width="400">
</p>

# MCP Stack — Claude Swiss Army Knife

A full MCP (Model Context Protocol) server stack with permission management.
Ubuntu Server, Obsidian Vault, Synology NAS, and GitHub — all with a web UI dashboard for managing users, permissions, and audit logs.

## Components

- **Ubuntu Server MCP** — File I/O, command execution, Docker management, systemd services, journalctl
- **Obsidian MCP** — Vault browsing, note read/write, full-text search, tags, backlinks, frontmatter
- **Synology NAS MCP** — File Station operations, system info, storage info, share listing
- **GitHub MCP** — Repo search, issue/PR management, file contents, code search
- **Web UI** — Permission manager dashboard with user auth, tool/command/path rules, audit logs, auto-discovery scans

## Quick Start

```bash
cp .env.example .env
bash scripts/generate-api-key.sh
bash scripts/setup-build.sh
docker compose up -d --build
```

Then open `http://localhost:8280` and log in with the API key from `.env`.

## Documentation

See [docs-site/](docs-site/) for full documentation.
