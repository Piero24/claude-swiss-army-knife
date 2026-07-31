---
sidebar_position: 1
---

# Development Environment

Set up a local development environment for working on the MCP stack.

## Prerequisites

- Python 3.12
- Node.js 22
- Docker + Docker Compose
- Git

## Python Setup

Create a virtual environment for each MCP server you're working on:

```bash
# Permission engine (shared)
cd mcp-servers/shared/mcp-permission-engine
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Ubuntu MCP
cd mcp-servers/ubuntu-server
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Web UI Setup

```bash
cd mcp-webui
npm install
npm run dev        # Starts on port 8280
```

## Running Without Docker

MCP servers can run directly on the host for development:

```bash
cd mcp-servers/ubuntu-server
PYTHONPATH=src:../shared/mcp-permission-engine/src \
  MCP_USER_ID=default \
  python -m ubuntu_mcp --config /path/to/config.yaml
```

## Running Tests

```bash
# Python tests
cd mcp-servers/shared/mcp-permission-engine
python -m pytest tests/ -v

# Web UI tests
cd mcp-webui
npm test

# TypeScript type checking
cd mcp-webui
npm run typecheck
```

## Running Docs Site

```bash
cd docs-site
npm install
npm run start       # Starts on port 3000
```

## Docker Development

```bash
# Build and run a single service
docker compose up -d --build ubuntu-mcp

# View logs
docker compose logs -f ubuntu-mcp

# Rebuild after changes
docker compose up -d --build ubuntu-mcp

# Access container shell
docker compose exec ubuntu-mcp bash
```
