#!/bin/bash
# Copy shared permission engine into each MCP server's build context.
# Docker cannot COPY files outside the build context, so this must run
# before `docker compose build`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHARED_SRC="$REPO_ROOT/mcp-servers/shared/mcp-permission-engine"

SERVERS=("ubuntu-server" "obsidian" "synology-nas")

for server in "${SERVERS[@]}"; do
    DEST="$REPO_ROOT/mcp-servers/$server/shared/mcp-permission-engine"
    rm -rf "$DEST"
    mkdir -p "$(dirname "$DEST")"
    cp -r "$SHARED_SRC" "$DEST"
    echo "✅ $server ← shared/mcp-permission-engine"
done

echo ""
echo "Done. You can now run: docker compose up -d --build"
