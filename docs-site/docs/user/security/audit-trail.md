---
sidebar_position: 3
---

# Audit Trail

Every access decision made by the permission engine is logged as structured JSON. This provides a complete, tamper-evident record for security review, debugging, and compliance.

## Log Format

Audit logs are written as JSON Lines: one JSON object per line, appended atomically. The log file is at `/var/log/mcp/<server>/audit.log`.

```json
{"ts":"2026-01-15T12:00:00Z","server":"ubuntu-mcp","target_type":"file","target":"/var/log/nginx/access.log","result":"allowed","access":"read","reason":"","user_id":"alice","tool":"ubuntu_read_file","granted":"read","required_access":"read"}
```

## Entry Schema

| Field | Type | Description |
|---|---|---|
| `ts` | ISO 8601 | Timestamp in UTC |
| `server` | string | MCP server name (e.g., `ubuntu-mcp`) |
| `target_type` | string | Type of resource: `file`, `command`, or `tool` |
| `target` | string | Filesystem path, command string, or tool name |
| `result` | string | `allowed` or `denied` |
| `access` | string | Access level requested (`read`, `write`, `execute`, `active`) |
| `granted` | string | Access level that was granted |
| `required_access` | string | Access level that was required |
| `reason` | string | Human-readable explanation (especially useful for denials) |
| `user_id` | string | Authenticated user from `MCP_USER_ID` (or `"default"`) |
| `subagent_id` | string | Claude Code sub-agent ID from `CLAUDE_AGENT_ID` (empty if not a sub-agent) |
| `tool` | string | The MCP tool that triggered the check |

## Log Location

Logs are stored on the host at the path configured in `.env`:

```bash
MCP_LOG_DIR=/var/log/mcp
```

Each server has its own subdirectory:

```
/var/log/mcp/
├── ubuntu/
│   └── audit.log
├── obsidian/
│   └── audit.log
├── synology/
│   └── audit.log
└── github/
    └── audit.log
```

## Querying Logs

### Using jq

```bash
# Show all denied requests
cat /var/log/mcp/ubuntu/audit.log | jq 'select(.result == "denied")'

# Show write attempts
cat /var/log/mcp/ubuntu/audit.log | jq 'select(.access == "write")'

# Count requests by user
cat /var/log/mcp/ubuntu/audit.log | jq -r '.user_id' | sort | uniq -c | sort -rn

# Show denials with reasons
cat /var/log/mcp/ubuntu/audit.log | jq 'select(.result == "denied") | {target, reason, user_id}'

# Requests in the last hour
cat /var/log/mcp/ubuntu/audit.log | jq "select(.ts >= \"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\")"
```

### Using grep

```bash
# Count denied requests
grep -c '"result":"denied"' /var/log/mcp/ubuntu/audit.log

# Find requests targeting /etc
grep '"/etc/' /var/log/mcp/ubuntu/audit.log

# Show recent activity (last 50 lines)
tail -50 /var/log/mcp/ubuntu/audit.log | jq .
```

## Log Rotation

See the [Hardening Guide](/user/security/hardening#log-rotation) for log rotation setup with `logrotate`.

## Monitoring Denied Requests

Denied requests are the most important signal in the audit log. They may indicate:

- **Misconfiguration**: A user needs access to something but the permission rules don't cover it
- **Exploration**: A user is trying to access things they shouldn't (check if this is legitimate)
- **Attack**: Someone is probing for vulnerabilities

Monitor the denied-to-allowed ratio. A sudden spike in denials warrants investigation:

```bash
# Quick denied ratio check
total=$(wc -l < /var/log/mcp/ubuntu/audit.log)
denied=$(grep -c '"result":"denied"' /var/log/mcp/ubuntu/audit.log)
echo "Denied ratio: $(( denied * 100 / total ))%"
```

## Integration with SIEM

The JSON Lines format is compatible with most log aggregation systems:

- **ELK Stack**: Use Filebeat with the `json` input type
- **Datadog**: Configure a custom log pipeline with JSON parsing
- **Grafana Loki**: Use Promtail with the `json` parser stage
- **Splunk**: Index the file directly; Splunk auto-detects JSON

Example Filebeat configuration:

```yaml
filebeat.inputs:
  - type: filestream
    id: mcp-audit
    paths:
      - /var/log/mcp/*/audit.log
    parsers:
      - ndjson:
          keys_under_root: true
          add_error_key: true
```
