---
sidebar_position: 4
---

# Production Checklist

Guidelines for deploying the MCP stack in a production environment.

## Pre-Deployment

- [ ] Use specific image tags instead of `latest`
- [ ] Pin base image versions in Dockerfiles
- [ ] Configure resource limits (CPU, memory) per service
- [ ] Set up a dedicated non-root user for the MCP stack
- [ ] Review and minimize volume mounts (only mount what's needed)
- [ ] Generate strong, unique secrets for all keys and tokens
- [ ] Use allowlist mode for user authentication
- [ ] Grant minimum necessary permissions in each config YAML

## Image Tags

```bash
# .env — use specific versions
UBUNTU_MCP_IMAGE_TAG=v1.2.0
OBSIDIAN_MCP_IMAGE_TAG=v1.2.0
SYNOLOGY_MCP_IMAGE_TAG=v1.2.0
GITHUB_MCP_IMAGE_TAG=v1.2.0
WEBUI_IMAGE_TAG=v1.2.0
DOCS_IMAGE_TAG=v1.2.0
```

## Resource Limits

Add to `docker-compose.yml`:

```yaml
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

  mcp-webui:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
```

## Networking

- [ ] Use Cloudflare Tunnel or a reverse proxy — never expose Web UI port directly
- [ ] Configure TLS with a valid certificate
- [ ] Set up firewall rules (UFW/iptables) to restrict access
- [ ] Use SSH key-only authentication (disable password auth)
- [ ] Consider a VPN or Cloudflare Access for additional authentication

## Logging

- [ ] Set up log rotation for audit logs (`/var/log/mcp/*/audit.log`)
- [ ] Configure a retention policy (30 days minimum recommended)
- [ ] Forward logs to a centralized system (ELK, Datadog, Grafana Loki)
- [ ] Set up alerting for spikes in denied requests

### Log Rotation Configuration

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
}
```

## Monitoring

- [ ] Monitor container health (`docker compose ps`, health check script)
- [ ] Set up resource usage alerts (CPU, memory, disk)
- [ ] Monitor the denied-to-allowed ratio in audit logs
- [ ] Check for container restarts (can indicate crashes)

## Backups

- [ ] Back up the `configs/` directory regularly
- [ ] Back up `.env` file (store securely)
- [ ] Back up Obsidian vault data (if using Obsidian MCP)
- [ ] Archive audit logs before rotation deletes them

### Backup Script Example

```bash
#!/bin/bash
# mcp-backup.sh
BACKUP_DIR=/backup/mcp/$(date +%Y%m%d)
mkdir -p $BACKUP_DIR
cp -r configs/ $BACKUP_DIR/
cp .env $BACKUP_DIR/
cp -r /DATA/obsidian-vaults/ $BACKUP_DIR/vaults/  # if using Obsidian
find /var/log/mcp -name "audit.log*.gz" -exec cp {} $BACKUP_DIR/logs/ \;
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR
```

Run via cron: `0 2 * * * /usr/local/bin/mcp-backup.sh`

## Updates

- [ ] Test updates in a staging environment first
- [ ] Review changelog and breaking changes before updating
- [ ] Back up configs before updating
- [ ] Use `docker compose up -d --build` for rolling updates
- [ ] Verify health after each update

### Update Procedure

```bash
# 1. Backup
tar -czf mcp-backup-$(date +%Y%m%d).tar.gz configs/ .env

# 2. Pull changes
git fetch origin
git diff main origin/main  # review changes

# 3. Apply
git pull
bash scripts/setup-build.sh
docker compose up -d --build

# 4. Verify
bash scripts/health-check.sh
docker compose logs --tail 20
```

## Rollback

If an update causes issues:

```bash
# 1. Restore configs
tar -xzf mcp-backup-YYYYMMDD.tar.gz

# 2. Revert to previous version
git checkout <previous-tag>

# 3. Rebuild
bash scripts/setup-build.sh
docker compose up -d --build

# 4. Verify
bash scripts/health-check.sh
```

## Security Review

- [ ] Rotate `WEBUI_API_KEY` and `WEBUI_AUTH_SECRET` on a schedule
- [ ] Review user list and remove unused accounts
- [ ] Review permission rules and remove unused grants
- [ ] Check Dependabot PRs and apply security patches promptly
- [ ] Rebuild images regularly to pick up base image patches
- [ ] Review audit logs for suspicious patterns
