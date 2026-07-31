---
sidebar_position: 5
---

# Verifying the Installation

After deploying the MCP stack, verify everything is working correctly.

## Health Check Script

Run the built-in health check:

```bash
bash scripts/health-check.sh
```

This checks the status of all Docker containers and reports any that are not running.

Expected output shows all containers as "running":

```
✓ ubuntu-mcp: running
✓ obsidian-mcp: running
✓ synology-mcp: running
✓ github-mcp: running
✓ mcp-webui: running
✓ docs-site: running
```

## Manual Container Check

```bash
docker compose ps
```

All services should show `Up` status. If any show `Exited` or `Restarting`, check the logs:

```bash
docker compose logs <service-name>
```

## Web UI Access

1. Navigate to `http://<your-server>:8280`
2. You should see the login page
3. Log in with the `WEBUI_API_KEY` from your `.env` file
4. The dashboard should show all server cards

If the login fails:
- Verify `WEBUI_API_KEY` matches exactly in `.env` and what you're typing
- Check the `mcp-webui` container logs: `docker compose logs mcp-webui`
- Ensure the port mapping is correct in `docker-compose.yml`

## Testing MCP Connectivity

### Test SSH Connection

From your local machine, verify SSH access to the server works:

```bash
ssh <UBUNTU_SERVER_USER>@<UBUNTU_SERVER_HOST>
```

### Test Docker Exec

Once SSH'd into the server, test that `docker exec` works for each MCP:

```bash
# Test Ubuntu MCP
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  docker exec -i ubuntu-mcp python -m ubuntu_mcp
```

A successful response lists all 12 tools with their schemas.

```bash
# Test Obsidian MCP
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  docker exec -i obsidian-mcp python -m obsidian_mcp
```

### Test from Claude Code

Add the MCP servers to your `~/.claude/settings.json` (see [Connecting Claude Code](/user/getting-started/claude-code-setup)) and restart Claude Code. In Claude Code, ask:

> List the available tools for the ubuntu-server MCP

Claude should list all 12 Ubuntu MCP tools.

## Permission Check

1. Open the Web UI dashboard
2. Click on a server card (e.g., Ubuntu Server)
3. Verify you see path and command permission tables
4. The default config should show at least one path rule and one command rule

If the page shows "No config":
- Ensure the configs directory is mounted correctly: `ls -la configs/`
- Check the YAML files exist: `ls configs/ubuntu-server.yaml`
- Verify the volume mount in `docker-compose.yml`

## Audit Log Check

1. In the Web UI, navigate to a server's detail page
2. Scroll to the Audit Log section
3. After making any MCP request from Claude Code, new entries should appear
4. Audit log files are at `/var/log/mcp/<server>/audit.log` on the host

## Common Startup Issues

### Container exits immediately

Check the logs for the failing container:

```bash
docker compose logs <service-name>
```

Common causes:
- Missing `.env` variables (check `SYNOLOGY_NAS_HOST`, `OBSIDIAN_VAULT_PATH`)
- Incorrect volume mount paths
- Docker socket permission issues (`/var/run/docker.sock`)

### Port already in use

If port 8280 or 3000 is already bound:

```bash
# Find what's using the port
sudo lsof -i :8280

# Change the port in .env
WEBUI_PORT=8281
```

### Permission denied on volume mounts

Ensure the directories exist and have correct permissions:

```bash
sudo mkdir -p /var/log/mcp/{ubuntu,obsidian,synology,github}
sudo chown -R 1000:1000 /var/log/mcp
```

### Synology connection fails

Verify NAS connectivity from the Docker host:

```bash
curl -k https://<SYNOLOGY_NAS_HOST>:<SYNOLOGY_NAS_PORT>/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query
```

## Next Steps

- [Connect Claude Code](/user/getting-started/claude-code-setup) to start using the MCP servers
- [Configure permissions](/user/security/permissions) to control access
- Explore the [Web UI guide](/user/webui/overview) for managing everything graphically
