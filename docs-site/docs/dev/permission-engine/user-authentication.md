---
sidebar_position: 6
---

# User Authentication

The permission engine supports per-user authentication with SHA-256 salted keys and three access modes.

## User Identity Flow

```
Claude Code sets env vars → SSH → docker exec -e → MCP container → PermissionEngine
                                                                         │
                                                    MCP_USER_ID ────────┤
                                                    MCP_USER_KEY ───────┤
                                                    CLAUDE_AGENT_ID ────┤ (audit only)
```

In Claude Code's `settings.json`:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": [
        "my-server",
        "docker", "exec", "-i",
        "-e", "MCP_USER_ID=alice",
        "-e", "MCP_USER_KEY=<plaintext-secret>",
        "ubuntu-mcp",
        "python", "-m", "ubuntu_mcp"
      ]
    }
  }
}
```

## Key Format

Keys are stored as SHA-256 salted hashes:

```
sha256$<16-byte-hex-salt>$<64-char-hex-hash>
```

Example:
```
sha256$a1b2c3d4e5f6a7b8$9f8e7d6c5b4a3210fedcba9876543210abcdef1234567890abcdef1234567890
```

### Key Generation

```python
import hashlib
import os

def hash_key(plaintext: str) -> str:
    salt = os.urandom(16).hex()
    hash_bytes = hashlib.sha256((salt + plaintext).encode()).digest()
    return f"sha256${salt}${hash_bytes.hex()}"
```

### Key Verification

```python
def verify_key(plaintext: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 3 or parts[0] != "sha256":
        return False
    _, salt, expected_hash = parts
    actual_hash = hashlib.sha256((salt + plaintext).encode()).hexdigest()
    return actual_hash == expected_hash
```

## Access Modes

### Open Mode

```yaml
mode: open
users:
  - id: "bob"
    enabled: false    # Only Bob is blocked
```

- Default: everyone can use all tools
- Explicitly disabled users are blocked
- Use when: single user or fully trusted environment

### Allowlist Mode

```yaml
mode: allowlist
users:
  - id: "alice"
    enabled: true
    tools: ["ubuntu_read_file", "ubuntu_system_info"]
```

- Default: everyone is denied
- Only users explicitly listed and enabled can use tools
- Each user can be restricted to specific tool names (comma-separated, or `*` for all)
- Use when: production, multi-user

### Blocklist Mode

```yaml
mode: blocklist
users:
  - id: "bob"
    enabled: false    # Only Bob is blocked
```

- Default: everyone can use all tools
- Explicitly disabled users are blocked
- Use when: most users are trusted, a few are blocked

## Implementation

```python
def check_tool_access(self, user_id: str, tool_name: str) -> bool:
    users = load_users(...)
    mode = users.mode
    user = next((u for u in users.users if u.id == user_id), None)

    if mode == "open":
        if user and not user.enabled:
            raise ForbiddenError(f"User '{user_id}' is disabled")
        return True

    if mode == "allowlist":
        if user is None:
            raise ForbiddenError(f"User '{user_id}' is not in the allowlist")
        if not user.enabled:
            raise ForbiddenError(f"User '{user_id}' is disabled")
        if not _tool_allowed(user, tool_name):
            raise ForbiddenError(f"Tool '{tool_name}' not allowed for user '{user_id}'")
        return True

    if mode == "blocklist":
        if user and not user.enabled:
            raise ForbiddenError(f"User '{user_id}' is blocked")
        return True
```

## Sub-Agent Identity

Claude Code sets `CLAUDE_AGENT_ID` when spawning sub-agents. This value is captured as `_observed_subagent_id` and logged in the audit trail, but **never used for access control decisions**. Access control is always based on the parent user's identity (`MCP_USER_ID`).
