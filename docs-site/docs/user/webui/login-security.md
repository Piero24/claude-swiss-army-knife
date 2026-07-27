---
sidebar_position: 7
---

# Login & Security

The Web UI uses API key authentication with encrypted session cookies. No user accounts or passwords: a single API key grants administrative access.

## Login

1. Navigate to `http://<your-server>:8280`
2. Enter your `WEBUI_API_KEY` (from `.env`)
3. Click "Log in"

The API key is validated against the server. On success, an encrypted session cookie is set and you are redirected to the dashboard.

![Web UI Login](/img/screenshots/login.png)

## API Key

The API key is configured in `.env`:

```bash
WEBUI_API_KEY=<64-char-hex-string>
```

Generate a strong random key:

```bash
bash scripts/generate-api-key.sh
# or manually:
openssl rand -hex 32
```

### Key Rotation

To rotate the API key:

1. Generate a new key: `openssl rand -hex 32`
2. Update `WEBUI_API_KEY` in `.env`
3. Restart the Web UI: `docker compose up -d --build mcp-webui`
4. All existing sessions are invalidated (the auth secret also changes on restart)

## Session Management

Sessions are managed via [iron-session](https://github.com/vvo/iron-session), which stores encrypted session data in a stateless cookie. The encryption key is `WEBUI_AUTH_SECRET` from `.env`.

Session properties:
- **Cookie name**: `mcp_webui_session`
- **Duration**: Browser session (until tab is closed)
- **Secure flag**: Set when served over HTTPS
- **HttpOnly**: Yes (not accessible from JavaScript)
- **SameSite**: Lax

## Logout

Click "Logout" in the dashboard header to destroy your session and return to the login page.

## Security Best Practices

### Use Cloudflare Tunnel

Never expose the Web UI directly to the internet. Route through Cloudflare Tunnel with an Access policy:

1. Create a Cloudflare Tunnel for port 8280
2. Add a Cloudflare Access application for the tunnel hostname
3. Require email verification or one-time PIN
4. This adds a layer of authentication before the Web UI login page is even reachable

### Use HTTPS

If not using Cloudflare Tunnel, put the Web UI behind a reverse proxy (nginx/Caddy) with a valid TLS certificate:

```nginx
# nginx reverse proxy example
server {
    listen 443 ssl;
    server_name mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8280;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Restrict by IP

If all users access from a known IP range (office VPN), restrict access at the firewall level:

```bash
# UFW example - only allow from office VPN subnet
sudo ufw allow from 10.0.0.0/8 to any port 8280
sudo ufw deny 8280
```

### Regular Key Rotation

Rotate `WEBUI_API_KEY` on a schedule (e.g., every 90 days). Combine with `WEBUI_AUTH_SECRET` rotation to invalidate all sessions at once.

### Audit Your Own Access

The Web UI logs its own API access. Periodically review `docker compose logs mcp-webui` for unusual activity.
