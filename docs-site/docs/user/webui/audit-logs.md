---
sidebar_position: 5
---

# Audit Logs

The audit log records every access decision made by the permission engine. Use it to monitor activity, debug permission issues, and detect unauthorized access attempts.

![Audit Log](/img/screenshots/audit-log.png)

## Understanding Audit Entries

Each log entry records:

| Field | Description |
|---|---|
| **Time** | Timestamp of the access decision (UTC) |
| **Target** | The file path, command, or tool name being accessed |
| **Access** | The access level requested (read, write, execute, active) |
| **Result** | Whether the request was `allowed` or `denied` |
| **Reason** | Human-readable explanation of the decision |
| **User** | The authenticated user ID (from `MCP_USER_ID`) |
| **Sub-agent** | Claude Code sub-agent ID (from `CLAUDE_AGENT_ID`, audit-only) |

## Filtering

The audit log supports four filter dimensions:

### Text Search
Free-text search across target, command, result, and reason fields.

### Access Level Filter
Filter by the access level requested:
- **All access**: No filter
- **Read**: Only read attempts
- **Write**: Only write attempts
- **None**: Only denied-by-default attempts

### Result Filter
Filter by decision outcome:
- **All results**: No filter
- **Allowed**: Only successful access
- **Denied**: Only denied access

### Date Range Filter
Filter by when the event occurred:
- **All time**: No filter
- **Last hour**: Events from the past 60 minutes
- **Today**: Events since midnight (server time)
- **This week**: Events from the past 7 days

Active filters are highlighted. Click "Clear filters" to reset all filters.

## Pagination

The audit log is paginated. Use the "Prev" and "Next" buttons at the bottom to navigate pages. The footer shows total entries and current page.

The page size is configurable in [Settings](/user/webui/settings) (50, 100, or 150 entries per page).

## Detail Panel

Click any row to expand a detail panel showing all fields for that entry in a structured grid layout:

- Timestamp, server, target type, target path
- Command (if applicable), access requested, result, reason
- User ID and sub-agent ID (if present)

## Audit Log Format

Logs are stored as JSON Lines (one JSON object per line) at `/var/log/mcp/<server>/audit.log`:

```json
{"ts": "2026-01-15T12:00:00Z", "server": "ubuntu-mcp", "target_type": "file", "target": "/var/log/nginx/access.log", "access": "read", "result": "allowed", "reason": "", "user_id": "alice", "tool": "ubuntu_read_file"}
{"ts": "2026-01-15T12:01:00Z", "server": "ubuntu-mcp", "target_type": "command", "target": "systemctl restart postgresql", "access": "execute", "result": "denied", "reason": "command not in allowlist", "user_id": "alice", "tool": "ubuntu_exec"}
```

This format is append-only and easily consumable by log processors like `jq`, `grep`, or centralized logging systems.

## Log Rotation

By default, audit logs grow indefinitely. Set up log rotation on the host:

```bash
# /etc/logrotate.d/mcp-audit
/var/log/mcp/*/audit.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
```

## Monitoring

For production deployments, consider forwarding audit logs to a centralized system:

```bash
# Forward to syslog
tail -f /var/log/mcp/*/audit.log | logger -t mcp-audit

# Or use filebeat/fluentd for ELK stack integration
```

Denied entries are especially important to monitor: they may indicate misconfiguration, a user trying to access something they should not, or an attempted attack.
