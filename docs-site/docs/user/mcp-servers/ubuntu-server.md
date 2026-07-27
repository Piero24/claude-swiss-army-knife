---
sidebar_position: 2
---

# Ubuntu Server MCP

Manage an Ubuntu server through Claude Code: file operations, command execution, Docker containers, and systemd services — all gated by the permission engine.

## Overview

The Ubuntu MCP runs inside a Docker container with `network_mode: host` and `pid: host`, giving it direct access to the host's filesystem and processes. Host paths are mounted under `/mnt/host/` inside the container.

| Property | Value |
|---|---|
| **Module** | `ubuntu_mcp` |
| **Entry point** | `python -m ubuntu_mcp` |
| **Config** | `configs/ubuntu-server.yaml` |
| **Container** | `ubuntu-mcp` |
| **Tools** | 12 |

## Tools Reference

### ubuntu_read_file

Read a file from the Ubuntu server filesystem.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Absolute path to the file on the host |

**Permission check**: `enforcer.check("read", path)` — the path must match a read or write rule.

**Example request**:
```
Read /var/log/nginx/access.log and show me the last 10 lines with 4xx errors
```

**Example output**:
```json
{
  "path": "/var/log/nginx/access.log",
  "content": "192.168.1.1 - - [01/Jan/2026:12:00:00 +0000] GET / HTTP/1.1 200 ...",
  "size": 45231
}
```

---

### ubuntu_write_file

Write content to a file (overwrites if it exists).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Absolute path to the file on the host |
| `content` | string | Yes | Content to write |

**Permission check**: `enforcer.check("write", path)` — the path must match a write rule.

---

### ubuntu_append_file

Append content to an existing file.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Absolute path to the file on the host |
| `content` | string | Yes | Content to append |

**Permission check**: `enforcer.check("write", path)` — the path must match a write rule.

---

### ubuntu_list_dir

List the contents of a directory.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | Yes | — | Absolute path to the directory |
| `recursive` | boolean | No | `false` | List recursively |

**Permission check**: `enforcer.check("read", path)` — the path must match a read or write rule.

**Example request**:
```
List the contents of /var/www, recursively
```

**Example output**:
```json
{
  "path": "/var/www",
  "entries": [
    {"name": "index.html", "type": "file", "size": 1234},
    {"name": "css", "type": "dir"}
  ],
  "count": 2
}
```

---

### ubuntu_exec

Execute a shell command on the Ubuntu server. **Heavily restricted**: commands must be explicitly allowlisted, and shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, etc.) are blocked to prevent injection.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `command` | string | Yes | — | The shell command to execute |
| `timeout` | integer | No | `30` | Timeout in seconds |

**Permission check**: `enforcer.check_command(command)` — the command pattern must match an allowlisted pattern.

**Shell metacharacter blocking**: The following characters are rejected in commands: `;`, `&`, `|`, `` ` ``, `$`, `(`, `)`, `{`, `}`, `[`, `]`, `\`, `<`, `>`, `!`, `'`, `"`. This prevents command chaining and injection attacks.

**Example request**:
```
Run: systemctl status nginx
```

**Example output**:
```json
{
  "command": "systemctl status nginx",
  "stdout": "● nginx.service - A high performance web server...",
  "stderr": "",
  "exit_code": 0
}
```

---

### ubuntu_system_info

Get system information: CPU, RAM, disk usage, load average, and uptime.

**No parameters required.**

**Permission check**: None — this is an informational tool with no filesystem or command access risk.

**Example request**:
```
What's the current load and memory usage on the server?
```

**Example output**:
```json
{
  "cpu_percent": 12.5,
  "memory": {"total_gb": 15.6, "used_gb": 8.2, "percent": 52.6},
  "disk": {"total_gb": 100, "used_gb": 45, "percent": 45},
  "load_avg": {"1min": 0.8, "5min": 0.6, "15min": 0.5},
  "uptime": "14 days, 3:22:15"
}
```

---

### ubuntu_service_status

Check the status of a systemd service.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `service` | string | Yes | Name of the systemd service (e.g., `nginx`, `docker`) |

**Permission check**: `enforcer.check_command("systemctl status <service>")` — must match an allowlisted pattern.

---

### ubuntu_service_manage

Manage a systemd service: start, stop, restart, or reload.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `service` | string | Yes | Name of the systemd service |
| `action` | string | Yes | One of: `start`, `stop`, `restart`, `reload` |

**Permission check**: `enforcer.check_command("systemctl <action> <service>")` — each action+service combination must be allowlisted.

**⚠️ Caution**: `restart` and `stop` are write-level operations. Be explicit in your command allowlist: prefer `systemctl status *` for read access and `systemctl restart nginx` for specific write operations.

---

### ubuntu_docker_ps

List Docker containers and their status.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `all` | boolean | No | `false` | Show all containers including stopped ones |

**Permission check**: `enforcer.check_command("docker ps")` — must match an allowlisted pattern.

---

### ubuntu_docker_logs

Get logs from a Docker container.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `container` | string | Yes | — | Name of the container |
| `tail` | integer | No | `100` | Number of lines to retrieve |

**Permission check**: `enforcer.check_command("docker logs <container>")` — must match an allowlisted pattern.

---

### ubuntu_docker_restart

Restart a Docker container.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `container` | string | Yes | Name of the container to restart |

**Permission check**: `enforcer.check_command("docker restart <container>")` — must match an allowlisted pattern.

---

### ubuntu_journalctl

Query the systemd journal.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `unit` | string | No | — | Filter by systemd unit name |
| `lines` | integer | No | `50` | Number of journal lines to retrieve |
| `since` | string | No | — | Show entries since a time (e.g., `1 hour ago`, `today`) |

**Permission check**: `enforcer.check_command("journalctl *")` — must match an allowlisted pattern.

**Example request**:
```
Show me the last 20 journal entries for nginx since today
```

## Configuration

Edit `configs/ubuntu-server.yaml`:

```yaml
server:
  name: ubuntu-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: none
  paths:
    - path: /var/log/**
      access: read
      description: "Read all log files"
    - path: /var/www/**
      access: write
      description: "Full access to web files"
    - path: /etc/nginx/**
      access: read
      description: "Read nginx config"
  commands:
    - pattern: "systemctl status *"
      access: active
      description: "Check any service status"
    - pattern: "systemctl restart nginx"
      access: active
      description: "Restart nginx"
    - pattern: "docker ps*"
      access: active
      description: "List Docker containers"
    - pattern: "docker logs *"
      access: active
      description: "Read container logs"
    - pattern: "journalctl *"
      access: active
      description: "Query systemd journal"
  default_command_access: none
```

## Path Mapping

Host paths are accessible inside the container under `/mnt/host/`. The `PathMapper` class handles translation:

| Host Path | Container Path |
|---|---|
| `/var/log/nginx/access.log` | `/mnt/host/var/log/nginx/access.log` |
| `/home/alice/project/` | `/mnt/host/home/alice/project/` |

The `safe_resolve_path()` method prevents path traversal attacks by verifying all resolved paths stay within configured allowed base directories.

## Volume Mounts

The `ubuntu-mcp` service mounts:

| Host Path | Container Path | Mode |
|---|---|---|
| `/home` | `/mnt/host/home` | Read-Write |
| `/var/www` | `/mnt/host/var/www` | Read-Write |
| `/var/log` | `/mnt/host/var/log` | Read-Only |
| `/etc/nginx` | `/mnt/host/etc/nginx` | Read-Write |
| `/var/run/docker.sock` | `/var/run/docker.sock` | — |
| `./configs/ubuntu-server.yaml` | `/app/config.yaml` | Read-Only |
| `./configs/users.yaml` | `/app/users.yaml` | Read-Only |
