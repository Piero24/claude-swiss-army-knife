# Docker Compose Deployment

Deploy the full stack with Docker Compose.

```bash
cp .env.example .env
bash scripts/generate-api-key.sh
docker compose up -d --build
bash scripts/health-check.sh
```

All services are defined in the root `docker-compose.yml`.
