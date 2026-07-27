---
sidebar_position: 2
---

# Permission System

Complete reference for the YAML-based permission system shared across all MCP servers.

## Configuration Structure

Each MCP server has its own config YAML file in `configs/`. The structure is:

```yaml
server:
  name: <server-name>
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: none
  paths: [...]
  commands: [...]
  default_command_access: none
  tools: [...]              # proxy servers only
  default_tool_access: none # proxy servers only
```

## Access Levels

| Level | For Paths | For Commands | For Tools | Description |
|---|---|---|---|---|
| `none` | Denied | Denied | Denied | Explicitly no access |
| `read` | List + read | — | — | Can read files and list directories |
| `write` | Create + update + delete | — | — | Full filesystem access (implies read) |
| `active` | — | Can execute | Can use tool | Binary allow/deny for commands and tools |

Access levels are hierarchical for paths: `write` implies `read`. For commands and tools, `active` is binary (either allowed or not).

## Path Rules

Path rules control filesystem access. Rules are evaluated by the `PathResolver` using:

1. **Deny-first**: Rules with `access: none` take priority over any matching `read` or `write` rule
2. **Longest-match**: When multiple non-none rules match, the most specific (longest) pattern wins

### Pattern Syntax

| Pattern | Matches |
|---|---|
| `/var/log/nginx/access.log` | Exactly that file |
| `/var/log/*` | All files directly inside `/var/log/` |
| `/var/log/**` | All files and folders recursively under `/var/log/` |
| `/var/www/*/public/**` | All files under `public/` in any subfolder of `/var/www/` |

### Examples

```yaml
paths:
  # Grant read access to all logs
  - path: /var/log/**
    access: read

  # Grant write access to web files
  - path: /var/www/**
    access: write

  # Explicitly deny access to sensitive config even if a broader rule matches
  - path: /var/www/**/.env
    access: none
    description: "Never expose environment files"

  # Grant read access to a single file
  - path: /etc/nginx/nginx.conf
    access: read
```

### Resolution Example

Given these rules:
```yaml
paths:
  - path: /var/www/**
    access: write
  - path: /var/www/admin/**
    access: read
  - path: /var/www/admin/secrets/**
    access: none
```

| Requested Path | Granted Access | Reason |
|---|---|---|
| `/var/www/index.html` | `write` | Matches `/var/www/**` |
| `/var/www/admin/config.php` | `read` | Longer match than `/var/www/**` |
| `/var/www/admin/secrets/key.txt` | `none` | Explicit deny takes priority |
| `/var/log/syslog` | `none` (default) | No rule matches |

## Command Rules

Command rules control which shell commands can be executed. They use fnmatch glob patterns.

### Pattern Syntax

| Pattern | Matches |
|---|---|
| `systemctl status nginx` | Exactly that command |
| `systemctl status *` | `systemctl status nginx`, `systemctl status docker`, etc. |
| `docker *` | Any docker command |
| `docker ps*` | `docker ps`, `docker ps -a` (but not `docker logs`) |

### Command Access Levels

For commands, access is binary:

- `active`: The command can be executed
- `none`: The command cannot be executed (or is explicitly denied)

### Shell Metacharacter Blocking

Before pattern matching, the command string is checked for shell metacharacters. Any of these characters will cause the command to be rejected regardless of pattern matching:

`;` `&` `|` `` ` `` `$` `(` `)` `{` `}` `[` `]` `\` `<` `>` `!` `'` `"`

This means commands like `cat file; rm -rf /` are blocked by the metacharacter check before pattern matching even runs.

### Examples

```yaml
commands:
  # Allow checking any service status
  - pattern: "systemctl status *"
    access: active

  # Allow restarting only nginx
  - pattern: "systemctl restart nginx"
    access: active

  # Allow listing Docker containers
  - pattern: "docker ps*"
    access: active

  # Allow reading container logs
  - pattern: "docker logs *"
    access: active

  # Explicitly deny dangerous operations
  - pattern: "rm *"
    access: none
    description: "Never allow file deletion"
```

## Tool Rules (Proxy Servers)

Tool rules control access to upstream MCP tools in proxy servers (GitHub MCP). They also use fnmatch glob patterns.

```yaml
tools:
  # Allow all search operations
  - pattern: "search_*"
    access: active

  # Allow reading specific resources
  - pattern: "get_file_contents"
    access: active
  - pattern: "list_commits"
    access: active

  # Explicitly deny destructive operations
  - pattern: "delete_file"
    access: none
  - pattern: "merge_pull_request"
    access: none
```

## Default Access

When no rule matches, the default access level applies:

```yaml
permissions:
  default_access: none              # For paths (recommended: none or read)
  default_command_access: none      # For commands (recommended: always none)
  default_tool_access: none         # For proxy tools (recommended: always none)
```

## User-Level Restrictions

In addition to path/command/tool rules, each user can be restricted to specific tools:

```yaml
# users.yaml
users:
  - id: "alice"
    tools: ["ubuntu_read_file", "ubuntu_list_dir", "ubuntu_system_info"]
    # Alice can only use these 3 tools, regardless of path/command rules

  - id: "bob"
    tools: ["*"]
    # Bob can use all tools
```

User tool restrictions are checked before path/command rules. If a user is not allowed to use a tool, path and command checks are skipped and the request is denied.
