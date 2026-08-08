---
sidebar_position: 5
---

# Security Webhooks

The MCP Gateway can POST security events to an external webhook URL in real time.
Use this to monitor for unauthorized access attempts, integrate with alerting
systems (Slack, Discord, PagerDuty), or build your own security dashboard.

## Enabling

Set the `SECURITY_WEBHOOK_URL` environment variable on the `mcp-gateway` container:

```yaml
# docker-compose.yml
services:
  mcp-gateway:
    environment:
      - SECURITY_WEBHOOK_URL=${SECURITY_WEBHOOK_URL:-}
```

```bash
# .env
SECURITY_WEBHOOK_URL=https://your-webhook-handler.example.com/events
```

When empty (the default), no webhook calls are made.

## Event Types

| Event | HTTP | Trigger |
|---|---|---|
| `missing_credentials` | 401 | No Bearer token or `X-MCP-User-ID` header present |
| `auth_failed` | 401 | Unknown user, disabled account, wrong key, or `"default"` user |
| `unknown_server` | 404 | Server name not recognised by the gateway |
| `bad_gateway` | 502 | Backend MCP server unreachable |

:::note
Tool-level access denials (`ForbiddenError` / 403) do **not** trigger webhooks.
Autonomous agents retry blocked tools, which would generate duplicate
notifications for every retry.
:::

## Payload Reference

Every webhook POST includes a `Content-Type: application/json` body with the
structure below.

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `event` | string | One of the event types above |
| `timestamp` | string | ISO 8601 UTC timestamp with microseconds |
| `gateway` | string | Always `"mcp-gateway"` |
| `http` | object | HTTP request context |
| `server` | object | Target MCP server info |
| `user` | object | Authenticated user info |
| `error` | object | Error classification |
| `client` | object | Resolved client identity |
| `headers` | object | Sanitised security-relevant request headers |

### `http`

| Field | Type | Description |
|---|---|---|
| `method` | string | HTTP method (`GET`, `POST`) |
| `path` | string | Request path (e.g. `"/mcp/obsidian/sse"`) |
| `status` | integer | HTTP status code returned to the client |

### `server`

| Field | Type | Description |
|---|---|---|
| `name` | string | Server name from the URL path |

Present for `auth_failed`, `unknown_server`, and `bad_gateway` events.
Empty (`{}`) for `missing_credentials` (the server is never resolved).

### `user`

| Field | Type | Description |
|---|---|---|
| `id` | string | The `X-MCP-User-ID` value (empty string if missing) |
| `authenticated` | boolean | `true` if the user passed authentication |

### `error`

| Field | Type | Description |
|---|---|---|
| `type` | string | Error class (`AuthenticationError`, `MissingCredentials`, `UnknownServer`, `BadGateway`) |
| `reason` | string | Human-readable reason (e.g. `"Invalid key for user 'alice'"`) |

### `client`

| Field | Type | Description |
|---|---|---|
| `ip` | string | Best-effort real client IP (see resolution order below) |
| `forwarded_for` | string | Raw `X-Forwarded-For` header value |
| `real_ip` | string | Raw `X-Real-IP` header value |
| `user_agent` | string | `User-Agent` header value |
| `cloudflare` | object | Cloudflare metadata (present only when CF headers exist) |

**`cloudflare` sub-object** (present only behind Cloudflare):

| Field | Type | Description |
|---|---|---|
| `connecting_ip` | string | `CF-Connecting-IP` — visitor's real IP |
| `country` | string | `CF-IPCountry` — two-letter country code |
| `ray_id` | string | `CF-Ray` — request trace ID |

**IP resolution order**: `CF-Connecting-IP` → `X-Real-IP` → first entry in
`X-Forwarded-For` → direct `request.client.host`.

### `headers`

A sanitised subset of the original request headers. Only security-relevant
headers are included:

`authorization`, `x-mcp-user-id`, `content-type`, `user-agent`,
`cf-ipcountry`, `cf-connecting-ip`, `cf-ray`, `x-forwarded-for`, `x-real-ip`

The `authorization` value is **truncated** to the first 12 characters + `***`
to prevent full bearer tokens from leaking into the webhook receiver.

## Examples

### Missing credentials

```json
{
  "event": "missing_credentials",
  "timestamp": "2026-08-08T14:22:10.123456+00:00",
  "gateway": "mcp-gateway",
  "http": {
    "method": "GET",
    "path": "/mcp/obsidian/sse",
    "status": 401
  },
  "server": {},
  "user": {
    "id": "",
    "authenticated": false
  },
  "error": {
    "type": "MissingCredentials",
    "reason": "Missing Authorization Bearer token or X-MCP-User-ID header"
  },
  "client": {
    "ip": "203.0.113.42",
    "forwarded_for": "203.0.113.42, 172.70.100.1",
    "real_ip": "203.0.113.42",
    "user_agent": "curl/8.7.1",
    "cloudflare": {
      "connecting_ip": "203.0.113.42",
      "country": "IT",
      "ray_id": "8a1b2c3d4e5f"
    }
  },
  "headers": {
    "user-agent": "curl/8.7.1",
    "cf-ipcountry": "IT",
    "cf-connecting-ip": "203.0.113.42",
    "cf-ray": "8a1b2c3d4e5f"
  }
}
```

### Auth failed (bad key)

```json
{
  "event": "auth_failed",
  "timestamp": "2026-08-08T14:23:45.654321+00:00",
  "gateway": "mcp-gateway",
  "http": {
    "method": "POST",
    "path": "/mcp/synology-nas/messages",
    "status": 401
  },
  "server": {
    "name": "synology-nas"
  },
  "user": {
    "id": "alice",
    "authenticated": false
  },
  "error": {
    "type": "AuthenticationError",
    "reason": "Invalid key for user 'alice'"
  },
  "client": {
    "ip": "198.51.100.10",
    "forwarded_for": "198.51.100.10",
    "real_ip": "198.51.100.10",
    "user_agent": "Claude-Code/2.0",
    "cloudflare": {
      "connecting_ip": "198.51.100.10",
      "country": "US",
      "ray_id": "9b2c3d4e5f6a"
    }
  },
  "headers": {
    "authorization": "Bearer sk-a***",
    "x-mcp-user-id": "alice",
    "content-type": "application/json",
    "user-agent": "Claude-Code/2.0",
    "cf-ipcountry": "US",
    "cf-connecting-ip": "198.51.100.10",
    "cf-ray": "9b2c3d4e5f6a"
  }
}
```

### Unknown server

```json
{
  "event": "unknown_server",
  "timestamp": "2026-08-08T14:24:00.000001+00:00",
  "gateway": "mcp-gateway",
  "http": {
    "method": "GET",
    "path": "/mcp/nosuchserver/sse",
    "status": 404
  },
  "server": {
    "name": "nosuchserver"
  },
  "user": {
    "id": "bob",
    "authenticated": true
  },
  "error": {
    "type": "UnknownServer",
    "reason": "Unknown MCP server 'nosuchserver'"
  },
  "client": {
    "ip": "192.0.2.55",
    "forwarded_for": "",
    "real_ip": "",
    "user_agent": "python-httpx/0.28.0"
  },
  "headers": {
    "authorization": "Bearer sk-9f***",
    "x-mcp-user-id": "bob",
    "user-agent": "python-httpx/0.28.0"
  }
}
```

## Reliability

Webhook delivery is **best-effort**:

- The POST runs in a background `asyncio` task — it never delays the error
  response sent to the client.
- The webhook client has a 5-second timeout.
- If the webhook URL is unreachable or returns an error, the gateway logs a
  warning and continues. No retries are attempted.
- The feature is **opt-in** — leave `SECURITY_WEBHOOK_URL` empty and zero
  webhook code executes.

## Receiver Example

A minimal Python (FastAPI) receiver:

```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.post("/events")
async def receive_event(request: Request):
    payload = await request.json()
    event_type = payload["event"]
    client_ip = payload["client"]["ip"]
    reason = payload["error"]["reason"]

    print(f"[{event_type}] {client_ip} — {reason}")

    # Integrate with your alerting here
    # e.g. post to Slack, log to DB, increment a counter, etc.

    return {"status": "ok"}
```
