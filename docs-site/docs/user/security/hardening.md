---
sidebar_position: 4
---

# Security Hardening Guide

Best practices for hardening your MCP deployment in production.

## Container Security

### Use Specific Image Tags

Never use `latest` tags in production. Pin specific versions:

```bash
# .env
UBUNTU_MCP_IMAGE_TAG=v1.2.0
OBSIDIAN_MCP_IMAGE_TAG=v1.2.0
SYNOLOGY_MCP_IMAGE_TAG=v1.2.0
GITHUB_MCP_IMAGE_TAG=v1.2.0
WEBUI_IMAGE_TAG=v1.2.0
```

### Resource Limits

Add resource limits to prevent denial-of-service through resource exhaustion:

```yaml
# docker-compose.yml
services:
  ubuntu-mcp:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
```

### Read-Only Root Filesystem

Where possible, make the container root filesystem read-only:

```yaml
services:
  obsidian-mcp:
    read_only: true
    tmpfs:
      - /tmp
```

Note: Not all MCP servers can use read-only root because they may need to write to `/var/log/mcp/`.

## Network Security

### Cloudflare Tunnel (Zero Open Ports)

Route all traffic through Cloudflare Tunnel instead of opening ports:

1. Install `cloudflared` on your server
2. Create a tunnel for the Web UI (port 8280)
3. Do NOT create tunnels for MCP servers: they communicate over stdio via SSH, not HTTP

See [Cloudflare Tunnel](/user/deployment/cloudflare-tunnel) for full setup instructions.

### Cloudflare Access (Zero Trust)

Add Cloudflare Access policies to the Web UI tunnel:

1. Create an Access application for the Web UI hostname
2. Require email verification (one-time PIN)
3. Optionally restrict to specific email addresses
4. This adds authentication before the Web UI login page is reachable

### SSH Key-Only Authentication

Disable password authentication on the Ubuntu server:

```bash
# /etc/ssh/sshd_config
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
```

Restart SSH: `sudo systemctl restart sshd`

### Firewall

Use UFW to restrict access:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22                 # SSH
sudo ufw allow from 10.0.0.0/8 to any port 8280  # Web UI from VPN only
sudo ufw enable
```

## Authentication

### Use Allowlist Mode in Production

```yaml
# users.yaml
mode: allowlist
users:
  - id: "production-user"
    key: "sha256$..."
    enabled: true
    tools: ["*"]
```

### Rotate API Keys Regularly

Rotate `WEBUI_API_KEY` and `WEBUI_AUTH_SECRET` on a schedule:

```bash
# Generate new keys
NEW_API_KEY=$(openssl rand -hex 32)
NEW_AUTH_SECRET=$(openssl rand -hex 32)

# Update .env
sed -i "s/^WEBUI_API_KEY=.*/WEBUI_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^WEBUI_AUTH_SECRET=.*/WEBUI_AUTH_SECRET=$NEW_AUTH_SECRET/" .env

# Restart Web UI
docker compose up -d --build mcp-webui
```

### Use Fine-Grained GitHub Tokens

For the GitHub MCP, use a fine-grained personal access token with minimum permissions:
- Repository access: Select specific repositories only
- Permissions: `Metadata: Read-only`, `Contents: Read-only` (add `Issues: Read and write` only if needed)

Never use a classic PAT with broad `repo` scope.

## Audit Log Monitoring

### Centralized Logging

Forward audit logs to a centralized system:

```bash
# Using filebeat for ELK stack
# /etc/filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/mcp/*/audit.log
    json.keys_under_root: true
    json.add_error_key: true
```

### Alerting on Denied Access

Monitor for denied access patterns that may indicate an attack:

```bash
# Check for spikes in denied requests
tail -1000 /var/log/mcp/*/audit.log | jq 'select(.result == "denied")' | wc -l
```

Set up alerts in your monitoring system when the denied-to-allowed ratio exceeds a threshold (e.g., more than 10% denials in 5 minutes).

### Log Rotation

```bash
# /etc/logrotate.d/mcp-audit
/var/log/mcp/*/audit.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    postrotate
        docker compose -f /path/to/docker-compose.yml exec -T ubuntu-mcp kill -HUP 1 || true
    endscript
}
```

## Dependencies

### Dependabot

Dependabot is configured in `.github/dependabot.yml` to scan weekly for:
- Python (pip) dependency updates
- npm dependency updates
- GitHub Actions updates

Review and merge dependency PRs promptly, especially security patches.

### Image Rebuilds

Rebuild Docker images regularly to pick up base image security patches:

```bash
# Pull latest base images and rebuild
docker compose build --no-cache
docker compose up -d
```

## Backup Strategy

### Configuration Files

Back up the entire `configs/` directory:

```bash
tar -czf mcp-configs-$(date +%Y%m%d).tar.gz configs/
```

### Vault Data

If using Obsidian MCP, back up the vault directory:

```bash
rsync -av /DATA/obsidian-vaults/ /backup/obsidian-vaults/
```

### Audit Logs

Archive audit logs before rotation deletes them:

```bash
find /var/log/mcp -name "audit.log*.gz" -exec cp {} /backup/audit-logs/ \;
```
