#!/bin/bash
# mcp-launcher — dispatcher for all MCP containers
# Install: sudo cp scripts/server/mcp-launcher.sh /usr/local/bin/mcp-launcher
#
# Maps container names to python modules and config paths.
# Credentials from /DATA/AppData/mcps-server/bin/client.env.
# Usage in .claude.json:
#   "obsidian": { "command": "ssh", "args": ["server@172.168.1.41", "obsidian-mcp"] }
set -e

CONTAINER="$1"
if [ -z "$CONTAINER" ]; then
  echo "Usage: mcp-launcher <container-name>" >&2
  exit 1
fi

case "$CONTAINER" in
  ubuntu-mcp)       MODULE="ubuntu_mcp";    CONFIG="ubuntu-server.yaml" ;;
  obsidian-mcp)     MODULE="obsidian_mcp";  CONFIG="obsidian.yaml" ;;
  synology-mcp)     MODULE="synology_mcp";  CONFIG="synology-nas.yaml" ;;
  github-mcp)       MODULE="src.server";    CONFIG="github-mcp.yaml" ;;
  link-manager-mcp) MODULE="link_manager";  CONFIG="link-manager.yaml" ;;
  *)
    echo "Unknown container: $CONTAINER" >&2
    exit 1
    ;;
esac

source /DATA/AppData/mcps-server/bin/client.env 2>/dev/null || true

exec docker exec -i \
  -e "MCP_USER_ID=${MCP_USER_ID:-}" \
  -e "MCP_USER_KEY=${MCP_USER_KEY:-}" \
  "$CONTAINER" python -m "$MODULE" --config "/app/configs/$CONFIG"
