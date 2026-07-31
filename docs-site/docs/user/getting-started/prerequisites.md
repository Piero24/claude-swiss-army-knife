---
sidebar_position: 1
---

# Prerequisites

What you need before installing the MCP Server Suite.

## Hardware

- **Ubuntu server** (20.04 LTS or later, 22.04 LTS recommended)
  - Minimum: 2 CPU cores, 4 GB RAM, 20 GB free disk
  - Recommended: 4 CPU cores, 8 GB RAM, 50 GB SSD
- **Synology NAS** (optional): DSM 7.x on the same LAN as the Ubuntu server
- **Local machine**: macOS, Linux, or Windows with Claude Code installed

## Software

All dependencies run inside Docker containers. You only need Docker on the host.

| Software | Version | Purpose |
|---|---|---|
| Docker | 24.0+ | Container runtime |
| Docker Compose | v2 (plugin) | Service orchestration |
| Git | any | Clone the repository |
| OpenSSH client | any | Connect from your Mac to the server |

Python 3.12 and Node.js 22 are bundled inside the Docker images: you do not need them installed on the host.

### Installing Docker

```bash
# Ubuntu — official Docker install
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

Verify the installation:

```bash
docker --version      # ≥ 24.0
docker compose version # must show "Docker Compose version v2.x"
```

## Network

- **SSH access** from your local machine to the Ubuntu server (key-based authentication recommended)
- **Cloudflare Tunnel** (recommended): A Cloudflare account with a domain, `cloudflared` installed on the server
- **Synology NAS** (optional): The NAS must be reachable from the Ubuntu server on port 5001 (HTTPS). Typically both are on the same LAN.

### SSH Key Setup (Recommended)

```bash
# On your local machine
ssh-keygen -t ed25519 -C "mcp@your-server"
ssh-copy-id <UBUNTU_SERVER_USER>@<UBUNTU_SERVER_HOST>
```

Test the connection:

```bash
ssh <UBUNTU_SERVER_USER>@<UBUNTU_SERVER_HOST> "echo connected"
```

## Account Credentials

Before starting, gather these credentials:

| Service | What You Need |
|---|---|
| Synology NAS | Username, password, and optional TOTP secret (if 2FA enabled). The account needs File Station access. |
| GitHub | Personal access token with `repo` and `read:org` scopes. Create at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. |
| Cloudflare | (Optional) API token or `cloudflared` login for tunnel setup. |

## Filesystem Preparation

Create directories for logs and configs:

```bash
# On the Ubuntu server
sudo mkdir -p /var/log/mcp/{ubuntu,obsidian,synology,github}
sudo chown -R $USER:$USER /var/log/mcp
```

If using Obsidian, ensure your vault directory exists:

```bash
ls /DATA/obsidian-vaults/personal
# Should contain .md files
```

## Knowledge Prerequisites

You should be comfortable with:

- Basic Docker commands (`docker ps`, `docker compose up`, `docker compose logs`)
- Editing YAML configuration files
- SSH and key-based authentication
- Basic Linux command line

## Next Step

Proceed to [Installation](/user/getting-started/installation) to deploy the stack.
