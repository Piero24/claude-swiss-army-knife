# Installation

How to install and configure the MCP Server Suite.

```bash
git clone git@github.com:Piero24/claude-swiss-army-knife.git
cd claude-swiss-army-knife
cp .env.example .env
# Edit .env with your server IPs, credentials, and paths
bash scripts/generate-api-key.sh
docker compose up -d --build
```
