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

Add MCP server definitions to `~/.claude.json` on your local machine.

### Simplified Setup (mcp-launcher)

The web UI automatically deploys `mcp-launcher.sh` to your server. Use this simplified format:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "description": "Ubuntu Server — manage the CasaOS host. Read/write files, run docker commands, control systemd services, check system health, view logs.",
      "command": "ssh",
      "args": [
        "server@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "/DATA/AppData/mcps-server/bin/mcp-launcher.sh",
        "ubuntu-mcp"
      ]
    },
    "obsidian": {
      "description": "Obsidian — personal knowledge base vault. Read notes, search by tag or full-text, get backlinks, list the vault structure.",
      "command": "ssh",
      "args": [
        "server@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "/DATA/AppData/mcps-server/bin/mcp-launcher.sh",
        "obsidian-mcp"
      ]
    },
    "synology-nas": {
      "description": "Synology NAS — main file storage. Browse shared folders, read files, search by name, check storage health and system info.",
      "command": "ssh",
      "args": [
        "server@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "/DATA/AppData/mcps-server/bin/mcp-launcher.sh",
        "synology-mcp"
      ]
    },
    "github": {
      "description": "GitHub — search repos, code, issues and PRs. Read/create issues, get file contents.",
      "command": "ssh",
      "args": [
        "server@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "/DATA/AppData/mcps-server/bin/mcp-launcher.sh",
        "github-mcp"
      ]
    }
  }
}
```

**Args explained** (5 total per server):

| Arg | Purpose |
|-----|---------|
| `server@<YOUR_IP_ADDRESS>` | SSH connection to your server |
| `MCP_USER_ID=...` | Your user ID (from Web UI → Agents → Generate) |
| `MCP_USER_KEY=...` | Your plaintext key (**not** the sha256 hash) |
| `/DATA/.../mcp-launcher.sh` | Server-side dispatcher script |
| `ubuntu-mcp` | Container name to launch |

No `docker exec`, `python -m`, or `--config` needed — the launcher handles all of that server-side.

Get your `MCP_USER_ID` and `MCP_USER_KEY` from the Web UI: **Agents → Add User → Generate**.

### Manual Setup (without launcher)

If the launcher isn't deployed yet, use the full format:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": [
        "my-mcp-server",
        "docker", "exec", "-i",
        "-e", "MCP_USER_ID=4923472957",
        "-e", "MCP_USER_KEY=K7mX-p3vN-change-me",
        "ubuntu-mcp",
        "python", "-m", "ubuntu_mcp",
        "--config", "/app/configs/ubuntu-server.yaml"
      ]
    }
  }
}
```

## User Identity

`MCP_USER_ID` and `MCP_USER_KEY` identify you to the permission engine. Get them from the Web UI (Agents page). If omitted, the user defaults to `"default"` with no authentication.

Claude Code also sets `CLAUDE_AGENT_ID` automatically when using sub-agents, which appears in audit logs but is not used for access control decisions.

## Test the Connection

Restart Claude Code after editing `settings.json`. Verify the MCP servers are connected by asking Claude:

> What tools are available in the ubuntu-server MCP?

Claude should list all 12 Ubuntu MCP tools.

You can also test manually from your terminal:

```bash
# Test Ubuntu MCP via the launcher
ssh server@<YOUR_IP_ADDRESS> /DATA/AppData/mcps-server/bin/mcp-launcher.sh ubuntu-mcp
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
