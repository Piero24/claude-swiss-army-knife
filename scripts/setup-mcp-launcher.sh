#!/bin/bash
# setup-mcp-launcher.sh — Install the MCP launcher on the CasaOS host
# Run once. After this, .claude.json shrinks to 2 args per server.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Installing MCP launcher ==="
sudo cp "$DIR/server/mcp-launcher.sh" /usr/local/bin/mcp-launcher
sudo chmod 755 /usr/local/bin/mcp-launcher
echo "  -> /usr/local/bin/mcp-launcher"

for name in ubuntu-mcp obsidian-mcp synology-mcp github-mcp link-manager-mcp; do
  sudo ln -sf /usr/local/bin/mcp-launcher "/usr/local/bin/$name"
  echo "  -> /usr/local/bin/$name -> mcp-launcher"
done

BIN_DIR="/DATA/AppData/mcps-server/bin"
sudo mkdir -p "$BIN_DIR"
if [ ! -f "$BIN_DIR/client.env" ]; then
  sudo cp "$DIR/server/client.env.example" "$BIN_DIR/client.env"
  sudo chmod 600 "$BIN_DIR/client.env"
  echo "  -> $BIN_DIR/client.env (edit with real credentials)"
else
  echo "  -> $BIN_DIR/client.env exists (skipped)"
fi

echo ""
echo "Done. .claude.json MCP servers are now:"
echo '  "ubuntu-server": { "command": "ssh", "args": ["server@172.168.1.41", "ubuntu-mcp"] }'
echo '  "obsidian":      { "command": "ssh", "args": ["server@172.168.1.41", "obsidian-mcp"] }'
echo '  "synology-nas":  { "command": "ssh", "args": ["server@172.168.1.41", "synology-mcp"] }'
echo '  "github":        { "command": "ssh", "args": ["server@172.168.1.41", "github-mcp"] }'
echo '  "link-manager":  { "command": "ssh", "args": ["server@172.168.1.41", "link-manager-mcp"] }'
