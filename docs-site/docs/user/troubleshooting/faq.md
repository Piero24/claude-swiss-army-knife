---
sidebar_position: 2
---

# FAQ

## General

### What is an MCP server?

MCP (Model Context Protocol) is an open standard that lets AI assistants like Claude Code interact with external tools. An MCP server is a program that exposes tools — Claude Code can discover and call these tools through a JSON-RPC protocol over stdio.

### Why run MCP servers in Docker?

Docker provides isolation, dependency management, and consistent deployment. Each MCP server runs in its own container with its own Python environment. The permission engine is shared across all servers but runs independently in each container.

### Do I need all four MCP servers?

No. Start only the servers you need. Comment out unused services in `docker-compose.yml` or use `docker compose up <service>` to start individual servers.

### Can I run this without Docker?

The MCP servers are designed for Docker but can run directly on the host. You would need Python 3.12, the `mcp` package, and the permission engine installed. Docker is strongly recommended for the provided isolation and security boundaries.

## Permissions

### How do I give Claude access to a new directory?

Add a path rule in the server's config YAML (e.g., `configs/ubuntu-server.yaml`):

```yaml
paths:
  - path: /new/directory/**
    access: read
```

Or use the Web UI: navigate to the server's detail page, click "Add", and enter the path.

### Changes I make in the Web UI aren't taking effect

Click "Save" after making changes. For server configs (path/command rules), changes are immediate with hot reload. For agent changes, click "Save" on the Agents page.

### Can I restrict a user to specific tools?

Yes. In the Web UI Agents page, edit the "Tools" field for a user. Enter comma-separated tool names (e.g., `ubuntu_read_file, ubuntu_system_info`) instead of `*`. Users in allowlist mode without `*` can only use the listed tools.

### What's the difference between "none" and removing a rule?

Removing a rule means the default access level applies (usually `none`). Setting a rule's access to `none` creates an explicit deny that overrides other matching rules. Use explicit denies for critical paths that must never be accessible (e.g., `.env` files).

## Security

### Are my credentials safe?

Credentials are stored in `.env` (on the Docker host) and passed to containers as environment variables. They are never hardcoded in source code or config files. The `.env` file should be protected with restrictive permissions:

```bash
chmod 600 .env
```

### Is the Web UI exposed to the internet?

Not by default. The Web UI runs on port 8280, which you should route through Cloudflare Tunnel or a reverse proxy with TLS. See [Cloudflare Tunnel](/user/deployment/cloudflare-tunnel) for zero-open-port setup.

### What happens if the audit log fills the disk?

By default, audit logs grow without bound. Set up [log rotation](/user/security/hardening#log-rotation) to manage disk usage.

## Multi-User

### How do I add another user?

1. Go to the Agents page in the Web UI
2. Click "Add"
3. Enter an ID, name, and generate a key
4. Click "Save"
5. Give the plaintext secret to the user
6. The user sets `MCP_USER_ID=<id>` and `MCP_USER_KEY=<secret>` in their Claude Code settings

### Can two users share the same key?

Technically yes, but it defeats the purpose of per-user audit logging. Generate a unique key per user.

### How does Claude Code sub-agent identity work?

Claude Code automatically sets `CLAUDE_AGENT_ID` when it spawns sub-agents. This value appears in audit logs (field `subagent_id`) for informational purposes but is **not used for access control decisions**. Access control is based on the parent user's identity (`MCP_USER_ID`).

## Operations

### How do I update the MCP stack?

```bash
git pull
bash scripts/setup-build.sh
docker compose up -d --build
```

### How do I back up my configuration?

```bash
tar -czf mcp-backup-$(date +%Y%m%d).tar.gz configs/ .env
```

### How do I reset everything?

```bash
docker compose down -v
rm -rf configs/*.yaml
git checkout -- configs/templates/
cp configs/templates/*.yaml configs/
# Re-edit configs, then:
docker compose up -d --build
```

### Where are the logs?

- **Container logs**: `docker compose logs <service>`
- **Audit logs**: `/var/log/mcp/<server>/audit.log` on the host
- **System logs**: `docker compose logs` shows stdout/stderr from all services
