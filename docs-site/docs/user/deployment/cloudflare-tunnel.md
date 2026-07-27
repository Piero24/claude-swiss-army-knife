---
sidebar_position: 3
---

# Cloudflare Tunnel

Route traffic securely to your MCP stack with zero open ports using Cloudflare Tunnel.

## Why Cloudflare Tunnel?

- **No open firewall ports**: The tunnel is an outbound connection from your server to Cloudflare
- **Built-in TLS**: Traffic is encrypted end-to-end
- **DDoS protection**: Cloudflare's network absorbs attacks
- **Zero Trust access**: Add Cloudflare Access policies for authentication before traffic reaches your server

## Architecture

```
Internet ──▶ Cloudflare Edge ──▶ cloudflared (outbound) ──▶ mcp-webui:8280
                                                                │
                                              ┌─────────────────┤
                                              ▼                 ▼
                                    SSH (port 22)     docs-site (port 3000)
```

The tunnel creates a persistent outbound connection from your server to Cloudflare's edge. Incoming requests are proxied through this connection.

## Setup

### 1. Install cloudflared

```bash
# Ubuntu/Debian
curl -fsSL https://pkg.cloudflare.com/cloudflared.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser window to authorize with your Cloudflare account.

### 3. Create a Tunnel

```bash
cloudflared tunnel create mcp-stack
```

This creates a tunnel with a unique ID and generates credentials at `~/.cloudflared/<tunnel-id>.json`.

### 4. Configure the Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  # Web UI
  - hostname: mcp.example.com
    service: http://localhost:8280

  # Docs site
  - hostname: docs.example.com
    service: http://localhost:3000

  # SSH access (for Claude Code MCP connections)
  - hostname: ssh.example.com
    service: ssh://localhost:22

  # Default: deny everything else
  - service: http_status:404
```

### 5. Create DNS Records

```bash
cloudflared tunnel route dns mcp-stack mcp.example.com
cloudflared tunnel route dns mcp-stack docs.example.com
cloudflared tunnel route dns mcp-stack ssh.example.com
```

### 6. Run the Tunnel

```bash
# Run as a systemd service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Verify:

```bash
cloudflared tunnel info mcp-stack
# Status should show "HEALTHY"
```

## SSH Over Tunnel

To use SSH over Cloudflare Tunnel (for Claude Code MCP connections), install `cloudflared` on your Mac and configure SSH:

```
# ~/.ssh/config
Host my-mcp-server
    HostName ssh.example.com
    User <UBUNTU_SERVER_USER>
    ProxyCommand cloudflared access ssh --hostname %h
```

Test:

```bash
ssh my-mcp-server "echo connected"
```

## Cloudflare Access (Zero Trust)

Add an additional authentication layer before the Web UI:

1. Go to Cloudflare Zero Trust dashboard
2. Applications → Add an application → Self-hosted
3. Enter `mcp.example.com` as the application domain
4. Add a policy: require "Email" with a one-time PIN
5. Optionally restrict to specific email addresses

Now accessing `https://mcp.example.com` requires:
1. Email verification (Cloudflare Access)
2. API key login (Web UI)

## SSH Browser Rendering (Optional)

Cloudflare can render SSH in a browser, but this is not compatible with Claude Code's MCP connection. Claude Code needs direct SSH access through the tunnel proxy as configured above. The browser-rendered SSH is only for emergency manual access.
