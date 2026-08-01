---
sidebar_position: 1
---

# Troubleshooting

Solutions for common issues when setting up and running the MCP stack.

## MCP Server Not Connecting

### Symptoms
- Claude Code reports "Server not found" or "Connection refused"
- `docker compose ps` shows the container as `Exited`

### Solutions

**Check container status:**
```bash
docker compose ps
docker compose logs ubuntu-mcp
```

**Verify SSH to the server works:**
```bash
ssh my-mcp-server "echo ok"
```

**Test docker exec manually:**
```bash
ssh my-mcp-server "echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | docker exec -i ubuntu-mcp python -m ubuntu_mcp"
```

**Rebuild the container:**
```bash
bash scripts/setup-build.sh
docker compose up -d --build ubuntu-mcp
```

## Permission Denied Errors

### Symptoms
- Claude Code says "Access denied" when trying to read a file or run a command
- The audit log shows `"result": "denied"` entries

### Solutions

**Check the audit log for the reason:**
```bash
tail -20 /var/log/mcp/ubuntu/audit.log | jq 'select(.result == "denied")'
```

**Verify path exists in config:**
```bash
cat configs/ubuntu-server.yaml | grep -A2 "path:"
```

**Check default access:**
If `default_access: none` and no path rule matches, access is denied. Add a rule or change the default.

**Check command patterns:**
Command patterns use fnmatch globbing. `systemctl status nginx` matches `systemctl status *` but NOT `systemctl *`.

## Hot-Reload Not Working

### Symptoms
- Editing a config YAML file doesn't take effect
- Changes require a container restart

### Solutions

**Check config file is mounted read-only:**
The config must be mounted as `:ro` so the server can detect external changes.

**Check server logs for reload messages:**
```bash
docker compose logs ubuntu-mcp | grep -i reload
```

**Check file permissions on the host:**
```bash
ls -la configs/ubuntu-server.yaml
```

**Force a reload by restarting:**
```bash
docker compose restart ubuntu-mcp
```

## Web UI Login Issues

### Symptoms
- Login page says "Invalid API key"
- Login succeeds but immediately redirects back to login

### Solutions

**Verify the API key in .env:**
```bash
grep WEBUI_API_KEY .env
```

**The key must match exactly** — no extra whitespace, no trailing newlines.

**Check Web UI container logs:**
```bash
docker compose logs mcp-webui
```

**Clear browser cookies and localStorage** for the Web UI domain, then try again.

**Generate a new key** if you suspect the key was corrupted:
```bash
bash scripts/generate-api-key.sh
# Copy output to .env
docker compose up -d --build mcp-webui
```

## Synology Connection Failures

### Symptoms
- DSM login fails at startup
- "Connection refused" or timeout

### Solutions

**Test DSM API connectivity from the Docker host:**
```bash
curl -k "https://<SYNOLOGY_NAS_HOST>:<SYNOLOGY_NAS_PORT>/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query"
```

**Check credentials:**
```bash
grep SYNOLOGY_NAS_ .env
```

**If 2FA is enabled:**
Verify `SYNOLOGY_NAS_OTP_SECRET` is the base32 secret (not the 6-digit code). Copy only the `secret=` value from your `otpauth://` URL. Leave empty if 2FA is disabled.

**Check DSM File Station is installed:**
The Synology MCP requires the File Station package to be installed on the NAS.

## Obsidian Vault Not Found

### Symptoms
- Obsidian MCP starts but shows "0 notes"
- `obsidian_list_vault` returns empty

### Solutions

**Verify the vault path:**
```bash
grep OBSIDIAN_VAULT_PATH .env
```

**Check the directory exists and contains .md files:**
```bash
ls /DATA/obsidian-vaults/personal/
```

**Check the volume mount inside the container:**
```bash
docker compose exec obsidian-mcp ls /data/vaults/
```

**Verify permissions on the vault directory:**
```bash
ls -la /DATA/obsidian-vaults/personal/
```
The Docker container user must have read access to the vault files.

## GitHub Proxy Issues

### Symptoms
- GitHub tools not available
- "Tool denied" in audit log

### Solutions

**Verify the GitHub token:**
```bash
grep GITHUB_TOKEN .env
```

**Check the token hasn't expired.** GitHub fine-grained tokens have configurable expiration dates.

**Check tool rules in config:**
```bash
cat configs/github-mcp.yaml | grep -A3 "pattern:"
```

**Test the proxy subprocess manually:**
```bash
docker compose exec github-mcp python -c "
from mcp_proxy import ProxyServer
p = ProxyServer('/app/config.yaml')
print('Proxy config loaded')
"
```

## Docker Socket Permission Errors

### Symptoms
- `ubuntu_docker_ps` returns "permission denied"
- Docker socket errors in logs

### Solutions

**Check Docker socket permissions:**
```bash
ls -la /var/run/docker.sock
# Should be: srw-rw---- 1 root docker
```

**Add your user to the docker group:**
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

**Check the container can access the socket:**
```bash
docker compose exec ubuntu-mcp ls -la /var/run/docker.sock
```

## Container Exits Immediately

### Symptoms
- `docker compose ps` shows `Restarting` or `Exited`
- Container restarts in a loop

### Solutions

**Check the container logs:**
```bash
docker compose logs <service-name>
```

Common causes:
- Missing required `.env` variable (e.g., `SYNOLOGY_NAS_HOST` is empty)
- Volume mount path doesn't exist
- Config YAML syntax error (run through a YAML validator)

## Getting Help

If you're still stuck:

1. **Check the audit logs**: `tail -100 /var/log/mcp/<server>/audit.log | jq .`
2. **Read the server logs**: `docker compose logs <service>`
3. **Search existing issues**: [GitHub Issues](https://github.com/Piero24/claude-swiss-army-knife/issues)
4. **Open a new issue**: Use the bug report template with:
   - Docker version (`docker --version`)
   - Docker Compose version (`docker compose version`)
   - Relevant logs (sanitized — remove credentials)
   - Steps to reproduce
