---
sidebar_position: 1
---

# Security Model

The MCP Server Suite uses a defense-in-depth approach. Every layer of the stack enforces security independently: if one layer fails, the next one still protects.

## Defense Layers

```
┌──────────────────────────────────────────┐
│ 1. Cloudflare Tunnel / Network           │  Zero open ports, authenticated tunnel
├──────────────────────────────────────────┤
│ 2. SSH                                   │  Key-only auth, no passwords
├──────────────────────────────────────────┤
│ 3. Docker Isolation                      │  Container boundaries, volume mounts
├──────────────────────────────────────────┤
│ 4. User Authentication                   │  SHA-256 key verification, access modes
├──────────────────────────────────────────┤
│ 5. Permission Engine                     │  Default-deny, per-path/command/tool
├──────────────────────────────────────────┤
│ 6. Injection Prevention                  │  Path traversal, shell metacharacter blocking
├──────────────────────────────────────────┤
│ 7. Audit Logging                         │  Every decision logged, tamper-evident
└──────────────────────────────────────────┘
```

## Principles

### Default Deny

All access is denied unless explicitly granted. This applies at every level:

- **Paths**: No filesystem access by default. Add path rules to grant `read` or `write`.
- **Commands**: No shell command execution by default. Add command patterns to grant `active`.
- **Tools (proxy servers)**: No API tool access by default. Add tool patterns to grant `active`.

```yaml
permissions:
  default_access: none           # No file access unless listed in paths
  default_command_access: none   # No command execution unless listed in commands
  default_tool_access: none      # No tool access unless listed in tools
```

### Explicit Grants

Every permission is an explicit entry in a YAML config file. There are no implicit grants, inherited permissions, or default allowlists. This makes the security posture auditable: you can read the config and know exactly what is allowed.

### Path Traversal Prevention

The `safe_resolve_path()` method prevents attacks that try to escape allowed directories:

1. **Null byte rejection**: Paths containing null bytes or control characters are rejected
2. **Path normalization**: `../` sequences are resolved
3. **Base directory verification**: The resolved absolute path is checked against a list of allowed base directories
4. **Deny on escape**: If the resolved path falls outside all allowed bases, access is denied

```python
# This is blocked:
# Request: /var/log/../../../etc/shadow
# Resolves to: /etc/shadow (outside allowed /var/log/ base)
```

### Shell Injection Prevention

The `check_command()` method blocks command injection attacks:

1. **Metacharacter rejection**: The following characters are always blocked in command strings:
   `;` `&` `|` `` ` `` `$` `(` `)` `{` `}` `[` `]` `\` `<` `>` `!` `'` `"`

2. **Pattern allowlisting**: After passing the metacharacter check, the full command string is matched against configured patterns using fnmatch glob matching

3. **No shell interpreter**: Commands are executed directly (not through `/bin/sh -c`), preventing shell expansion attacks

```python
# These are all blocked:
"cat /var/log/syslog; rm -rf /"     # semicolon chaining
"cat /var/log/syslog && rm -rf /"   # AND chaining
"cat /var/log/$(whoami).log"        # command substitution
```

### Audit Trail

Every access decision (allow and deny) is logged as a structured JSON entry with:

- Timestamp (UTC)
- Server name
- Target type (file, command, tool)
- Target path/command/tool name
- Access level requested
- Decision (allowed or denied)
- Reason for denial (if applicable)
- Authenticated user ID
- Observed sub-agent ID (Claude Code sub-agents)

This provides a complete, tamper-evident record for security review and compliance.

### Hot Reload

Permission changes take effect in under 1 second without restarting containers. The config file watcher (`watchfiles`) detects changes and triggers an atomic config reload. This means you can respond to security incidents by revoking permissions immediately.
