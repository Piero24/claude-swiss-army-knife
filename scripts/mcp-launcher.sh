#!/bin/bash
# mcp-launcher — dispatcher for all MCP containers
# Maps container names to python modules and config paths.
set -e

CONTAINER="$1"
USER_ID="${2:-$MCP_USER_ID}"
USER_KEY="${3:-$MCP_USER_KEY}"

if [ -z "$CONTAINER" ]; then
  echo "Usage: mcp-launcher <container-name> [user-id] [user-key]" >&2
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

# Fallback to client.env if credentials not supplied as args or env
if [ -z "$USER_ID" ] || [ -z "$USER_KEY" ]; then
  if [ -f /DATA/AppData/mcps-server/bin/client.env ]; then
    source /DATA/AppData/mcps-server/bin/client.env 2>/dev/null || true
  elif [ -f /DATA/AppData/mcps-server/settings/client.env ]; then
    source /DATA/AppData/mcps-server/settings/client.env 2>/dev/null || true
  fi
  USER_ID="${USER_ID:-$MCP_USER_ID}"
  USER_KEY="${USER_KEY:-$MCP_USER_KEY}"
fi

exec docker exec -i \
  -e "MCP_USER_ID=${USER_ID}" \
  -e "MCP_USER_KEY=${USER_KEY}" \
  "$CONTAINER" python -m "$MODULE" --config "/app/configs/$CONFIG"
