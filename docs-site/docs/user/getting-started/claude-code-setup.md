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

### Secure Setup (mcp-gateway Container on Port 2222)

The stack runs a containerized SSH Gateway (`mcp-gateway`) on port 2222. Connections land inside an unprivileged Docker container sandbox without host OS shell access:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "description": "Ubuntu Server — manage the CasaOS host. Read/write files, run docker commands, control systemd services, check system health, view logs.",
      "command": "ssh",
      "args": [
        "-p",
        "2222",
        "mcpuser@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "mcp-launcher",
        "ubuntu-mcp"
      ]
    },
    "obsidian": {
      "description": "Obsidian — personal knowledge base vault. Read notes, search by tag or full-text, get backlinks, list the vault structure.",
      "command": "ssh",
      "args": [
        "-p",
        "2222",
        "mcpuser@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "mcp-launcher",
        "obsidian-mcp"
      ]
    },
    "synology-nas": {
      "description": "Synology NAS — main file storage. Browse shared folders, read files, search by name, check storage health and system info.",
      "command": "ssh",
      "args": [
        "-p",
        "2222",
        "mcpuser@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "mcp-launcher",
        "synology-mcp"
      ]
    },
    "github": {
      "description": "GitHub — search repos, code, issues and PRs. Read/create issues, get file contents.",
      "command": "ssh",
      "args": [
        "-p",
        "2222",
        "mcpuser@<YOUR_IP_ADDRESS>",
        "MCP_USER_ID=4923472957",
        "MCP_USER_KEY=K7mX-p3vN-change-me",
        "mcp-launcher",
        "github-mcp"
      ]
    }
  }
}
```

**Args explained** (5 total per server):

| Arg | Purpose |
|-----|---------|
| `-p 2222` | Connects to containerized SSH gateway port |
| `mcpuser@<YOUR_IP_ADDRESS>` | Isolated container user |
| `MCP_USER_ID=...` | Your user ID (from Web UI → Settings → Add User) |
| `MCP_USER_KEY=...` | Your plaintext key (**not** the sha256 hash) |
| `mcp-launcher` | Containerized stdio dispatcher |
| `ubuntu-mcp` | Target container name |

No `docker exec`, `python -m`, or `--config` needed — the containerized gateway handles all of that server-side.

Get your `MCP_USER_ID` and `MCP_USER_KEY` from the Web UI: **Settings → Add User → Generate**.

## Test the Connection

Restart Claude Code after editing `settings.json`. Verify the MCP servers are connected by asking Claude:

> What tools are available in the ubuntu-server MCP?

Claude should list all 12 Ubuntu MCP tools.

You can also test manually from your terminal:

```bash
# Test connection via containerized SSH gateway on port 2222
ssh -p 2222 mcpuser@<YOUR_IP_ADDRESS> MCP_USER_ID=<YOUR_ID> MCP_USER_KEY=<YOUR_KEY> mcp-launcher ubuntu-mcp
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
