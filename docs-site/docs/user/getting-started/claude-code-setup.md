---
sidebar_position: 4
---

# Connecting Claude Code

Connect Claude Code on your local machine to the MCP servers running on your Ubuntu server.

## How It Works

```
Claude Code (Mac) ──SSH──▶ Ubuntu Server ──docker exec──▶ MCP Container
```

Claude Code uses SSH to reach your server, then runs `docker exec -i` to pipe stdio into the MCP container. No MCP ports are exposed: the MCP protocol runs entirely over stdio inside the SSH tunnel.

## SSH Configuration (Recommended)

Configure SSH for passwordless, connection-sharing access. Add to `~/.ssh/config` on your Mac:

```
Host my-mcp-server
    HostName <UBUNTU_SERVER_HOST>
    User <UBUNTU_SERVER_USER>
    IdentityFile ~/.ssh/id_ed25519
    ControlMaster auto
    ControlPath ~/.ssh/control-%r@%h:%p
    ControlPersist 10m
```

The `ControlMaster` and `ControlPersist` settings reuse SSH connections, avoiding repeated authentication for each MCP call. Test it:

```bash
ssh my-mcp-server "echo ok"
```

## Cloudflare Tunnel SSH (Optional)

If your server is behind Cloudflare Tunnel, configure SSH through the tunnel. Add to `~/.ssh/config`:

```
Host my-mcp-server
    HostName <your-domain>.example.com
    User <UBUNTU_SERVER_USER>
    Port 22
    ProxyCommand cloudflared access ssh --hostname %h
    ControlMaster auto
    ControlPath ~/.ssh/control-%r@%h:%p
    ControlPersist 10m
```

## Configure Claude Code MCP Servers

Add MCP server definitions to `~/.claude/settings.json` on your local machine:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": [
        "my-mcp-server",
        "docker", "exec", "-i", "ubuntu-mcp",
        "python", "-m", "ubuntu_mcp"
      ]
    },
    "obsidian": {
      "command": "ssh",
      "args": [
        "my-mcp-server",
        "docker", "exec", "-i", "obsidian-mcp",
        "python", "-m", "obsidian_mcp"
      ]
    },
    "synology-nas": {
      "command": "ssh",
      "args": [
        "my-mcp-server",
        "docker", "exec", "-i", "synology-mcp",
        "python", "-m", "synology_mcp"
      ]
    },
    "github": {
      "command": "ssh",
      "args": [
        "my-mcp-server",
        "docker", "exec", "-i", "github-mcp",
        "python", "-m", "server"
      ]
    }
  }
}
```

Replace `my-mcp-server` with the SSH host alias you configured above.

## User Identity (Multi-User Setup)

If you have multiple users configured in `users.yaml`, each Claude Code instance can identify itself:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": [
        "my-mcp-server",
        "docker", "exec", "-i",
        "-e", "MCP_USER_ID=alice",
        "-e", "MCP_USER_KEY=<alice-key>",
        "ubuntu-mcp",
        "python", "-m", "ubuntu_mcp"
      ]
    }
  }
}
```

The environment variables `MCP_USER_ID` and `MCP_USER_KEY` are read by the permission engine to identify the calling user. If omitted, the user defaults to `"default"` with no authentication.

Claude Code also sets `CLAUDE_AGENT_ID` automatically when using sub-agents, which appears in audit logs but is not used for access control decisions.

## Test the Connection

Restart Claude Code after editing `settings.json`. Verify the MCP servers are connected by asking Claude:

> What tools are available in the ubuntu-server MCP?

Claude should list all 12 Ubuntu MCP tools.

You can also test manually from your terminal:

```bash
# Test Ubuntu MCP
ssh my-mcp-server "echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | docker exec -i ubuntu-mcp python -m ubuntu_mcp"
```

A successful response will show the full tool list as JSON.

## Troubleshooting

**"Connection refused" or timeout:**
- Verify SSH works: `ssh my-mcp-server "docker ps"`
- Check the container is running: on the server, `docker ps | grep ubuntu-mcp`

**"Module not found" error:**
- The shared permission engine was not copied. Run `bash scripts/setup-build.sh` and rebuild: `docker compose up -d --build ubuntu-mcp`

**Permission denied on tools:**
- Check the audit log in the Web UI for denial reasons
- Verify path or command rules exist in the config YAML for the tool you're trying to use

**"Server not found" in Claude Code:**
- Ensure Claude Code was restarted after editing `settings.json`
- Check the JSON syntax: trailing commas are not allowed

## Next Steps

- Try your first MCP command: ask Claude to run `ubuntu_system_info`
- [Set up permissions](/user/security/permissions) through the Web UI
- Explore the [MCP Servers reference](/user/mcp-servers/overview) for all available tools
