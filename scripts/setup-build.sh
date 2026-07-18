#!/bin/bash
# Copy shared libraries into each MCP server's build context.
# Docker cannot COPY files outside the build context, so this must run
# before `docker compose build`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHARED_ENGINE="$REPO_ROOT/mcp-servers/shared/mcp-permission-engine"
SHARED_PROXY="$REPO_ROOT/mcp-servers/shared/mcp-proxy"

SERVERS=("ubuntu-server" "obsidian" "synology-nas" "github")

for server in "${SERVERS[@]}"; do
    ENGINE_DEST="$REPO_ROOT/mcp-servers/$server/shared/mcp-permission-engine"
    rm -rf "$ENGINE_DEST"
    mkdir -p "$(dirname "$ENGINE_DEST")"
    cp -r "$SHARED_ENGINE" "$ENGINE_DEST"
    echo "✅ $server ← shared/mcp-permission-engine"

    PROXY_DEST="$REPO_ROOT/mcp-servers/$server/shared/mcp-proxy"
    rm -rf "$PROXY_DEST"
    mkdir -p "$(dirname "$PROXY_DEST")"
    cp -r "$SHARED_PROXY" "$PROXY_DEST"
    echo "✅ $server ← shared/mcp-proxy"
done

echo ""
echo "Done. You can now run: docker compose up -d --build"
