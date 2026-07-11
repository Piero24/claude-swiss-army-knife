#!/bin/bash
# Check health of all MCP containers
# Usage: bash scripts/health-check.sh

echo "=== MCP Stack Health Check ==="
echo ""

CONTAINERS=("ubuntu-mcp" "obsidian-mcp" "synology-mcp" "mcp-webui" "docs-site")

for c in "${CONTAINERS[@]}"; do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)
  if [ "$STATUS" = "running" ]; then
    echo "✅ $c — running"
  elif [ -z "$STATUS" ]; then
    echo "⚠️  $c — not found"
  else
    echo "❌ $c — $STATUS"
  fi
done

echo ""
echo "=== Docker Compose Status ==="
docker compose ps 2>/dev/null || echo "Not in compose directory or docker compose not available"
