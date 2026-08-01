---
sidebar_position: 7
---

# Audit System

The `AuditLogger` writes structured JSON Lines to record every access decision made by the permission engine.

## AuditLogger Class

```python
class AuditLogger:
    def __init__(self, log_path: str):
        self._log_path = Path(log_path)
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

    def allowed(self, server, target_type, target, access, granted,
                tool="", user_id="", subagent_id=""):
        self._write("allowed", server, target_type, target, access, "",
                    tool, user_id, subagent_id, granted=granted)

    def denied(self, server, target_type, target, reason,
               required_access="", granted_access="", tool="",
               user_id="", subagent_id=""):
        self._write("denied", server, target_type, target,
                    required_access, reason, tool, user_id, subagent_id)
```

## JSON Lines Format

Each log entry is a single line of JSON:

```json
{"ts":"2026-01-15T12:00:00Z","server":"ubuntu-mcp","target_type":"file","target":"/var/log/nginx/access.log","result":"allowed","access":"read","reason":"","user_id":"alice","tool":"ubuntu_read_file","granted":"read","required_access":"read"}
```

The format is JSON Lines (`.jsonl`): one JSON object per line, appended atomically. This format is:
- **Human-readable** with `tail -f | jq`
- **Machine-parseable** by log aggregators
- **Append-only**: no in-place modification, tamper-evident
- **Line-oriented**: easy to rotate, truncate, and stream

## When Audit Events Fire

| Event | Method | When |
|---|---|---|
| Access granted | `audit.allowed()` | After successful `check()`, `check_command()`, or `check_tool()` |
| Access denied | `audit.denied()` | When `ForbiddenError` is raised |
| Authentication failure | Logged as denied | When `authenticate()` fails |

## Thread Safety

Audit log writes are protected by a `threading.Lock` to prevent interleaved JSON lines when multiple requests arrive concurrently:

```python
class AuditLogger:
    def __init__(self, log_path: str):
        self._lock = threading.Lock()

    def _write(self, result, server, target_type, target, access,
               reason, tool, user_id, subagent_id, **extra):
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "server": server,
            "target_type": target_type,
            "target": target,
            "result": result,
            "access": access,
            "reason": reason,
            "user_id": user_id,
            "subagent_id": subagent_id,
            "tool": tool,
            **extra,
        }
        with self._lock:
            with open(self._log_path, "a") as f:
                json.dump(entry, f)
                f.write("\n")
```

## Reading Audit Logs

The Web UI reads audit logs through a helper function:

```python
def read_audit_log(log_path: str, limit: int = 50,
                   offset: int = 0) -> list[dict]:
    entries = []
    with open(log_path, "r") as f:
        # Read in reverse to get most recent first
        lines = f.readlines()
        for line in reversed(lines[-(offset + limit):-offset] if offset else lines[-limit:]):
            try:
                entries.append(json.loads(line.strip()))
            except json.JSONDecodeError:
                continue
    return entries
```

## Log Rotation

The audit log grows indefinitely. Set up `logrotate` on the host:

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
