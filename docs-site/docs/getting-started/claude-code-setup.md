# Claude Code Setup

Connect Claude Code to your MCP servers.

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": ["your-server", "docker", "exec", "-i", "ubuntu-mcp", "python", "-m", "ubuntu_mcp"]
    },
    "obsidian": {
      "command": "ssh",
      "args": ["your-server", "docker", "exec", "-i", "obsidian-mcp", "python", "-m", "obsidian_mcp"]
    },
    "synology-nas": {
      "command": "ssh",
      "args": ["your-server", "docker", "exec", "-i", "synology-mcp", "python", "-m", "synology_mcp"]
    }
  }
}
```
