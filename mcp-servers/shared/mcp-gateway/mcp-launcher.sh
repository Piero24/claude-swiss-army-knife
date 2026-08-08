#!/bin/bash
# mcp-launcher.sh — containerized stdio dispatcher for MCP servers
set -e

# Extract command string from SSH_ORIGINAL_COMMAND or arguments
CMD_LINE="${SSH_ORIGINAL_COMMAND:-$@}"
read -r -a ARGS <<< "$CMD_LINE"

CONTAINER=""
USER_ID="${MCP_USER_ID:-}"
USER_KEY="${MCP_USER_KEY:-}"

# Parse key=value pairs or container name
NON_ENV_ARGS=()
for arg in "${ARGS[@]}"; do
  case "$arg" in
    MCP_USER_ID=*)  USER_ID="${arg#*=}" ;;
    MCP_USER_KEY=*) USER_KEY="${arg#*=}" ;;
    mcp-launcher|mcp-launcher.sh) ;; # ignore script name if passed in command
    *) NON_ENV_ARGS+=("$arg") ;;
  esac
done

# Check non-env arguments for container name and optional positional credentials
if [ ${#NON_ENV_ARGS[@]} -gt 0 ]; then
  CONTAINER="${NON_ENV_ARGS[0]}"
  if [ -z "$USER_ID" ] && [ ${#NON_ENV_ARGS[@]} -gt 1 ]; then
    USER_ID="${NON_ENV_ARGS[1]}"
  fi
  if [ -z "$USER_KEY" ] && [ ${#NON_ENV_ARGS[@]} -gt 2 ]; then
    USER_KEY="${NON_ENV_ARGS[2]}"
  fi
fi

# Normalize container name mapping to container name, python module, and config file
case "$CONTAINER" in
  ubuntu-server|ubuntu-mcp|ubuntu)            CONTAINER="ubuntu-mcp";       MODULE="ubuntu_mcp";   CONFIG="ubuntu-server.yaml" ;;
  obsidian|obsidian-mcp)                       CONTAINER="obsidian-mcp";     MODULE="obsidian_mcp"; CONFIG="obsidian.yaml" ;;
  synology-nas|synology-mcp|synology)           CONTAINER="synology-mcp";     MODULE="synology_mcp"; CONFIG="synology-nas.yaml" ;;
  github|github-mcp)                           CONTAINER="github-mcp";       MODULE="src.server";   CONFIG="github-mcp.yaml" ;;
  link-manager|link-manager-mcp|link_manager) CONTAINER="link-manager-mcp"; MODULE="link_manager"; CONFIG="link-manager.yaml" ;;
  *)
    echo "Error: Unknown MCP container '$CONTAINER'" >&2
    echo "Available containers: ubuntu-server, obsidian, synology-nas, github, link-manager" >&2
    exit 1
    ;;
esac

# Execute docker exec -i to pipe stdio
exec docker exec -i \
  -e "MCP_USER_ID=${USER_ID}" \
  -e "MCP_USER_KEY=${USER_KEY}" \
  "$CONTAINER" python -m "$MODULE" --config "/app/configs/$CONFIG"
