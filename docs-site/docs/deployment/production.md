# Production Deployment

Guidelines for deploying in production.

- Use specific image tags instead of `latest`
- Configure resource limits in Docker Compose
- Set up log rotation for audit logs
- Enable health checks for all services
- Use a reverse proxy (nginx/Caddy) if not using Cloudflare Tunnel
- Regular backups of config and vault data
