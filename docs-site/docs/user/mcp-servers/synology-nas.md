---
sidebar_position: 4
---

# Synology NAS MCP

Manage your Synology NAS through Claude Code: list, read, write, move, and delete files; check system and storage information; browse shared folders.

## Overview

The Synology MCP communicates with your NAS via the DSM 7.x REST API (File Station v2 and System APIs). It handles authentication, session management, and TOTP-based 2FA automatically.

| Property | Value |
|---|---|
| **Module** | `synology_mcp` |
| **Entry point** | `python -m synology_mcp` |
| **Config** | `configs/synology-nas.yaml` |
| **Container** | `synology-mcp` |
| **API** | DSM 7.x HTTPS (port 5001) |
| **Auth** | DSM login + optional TOTP 2FA |
| **Tools** | 9 |

## Prerequisites

- Synology NAS running DSM 7.x
- File Station package installed and enabled
- A DSM user account with File Station access
- NAS reachable from the Ubuntu server (same LAN, or routed)
- If 2FA is enabled on the account: the base32 TOTP secret from your `otpauth://` URL

## Tools Reference

### syno_file_list

List files in a Synology shared folder.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `folder_path` | string | Yes | — | Path within a shared folder (e.g., `/Documents`) |
| `limit` | integer | No | `500` | Maximum entries to return |

**Permission check**: `enforcer.check("read", folder_path)`.

**Example output**:
```json
{
  "files": [
    {"name": "report.pdf", "path": "/Documents/report.pdf", "isdir": false, "size": 245000},
    {"name": "Archive", "path": "/Documents/Archive", "isdir": true}
  ],
  "count": 2
}
```

---

### syno_file_read

Read a file from the Synology NAS. Downloads the file content via the File Station API and returns it as text.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Full path to the file on the NAS |

**Permission check**: `enforcer.check("read", file_path)`.

**Example output**:
```json
{
  "content": "Hello, world!\nThis is a file on the NAS.",
  "path": "/Documents/notes.txt"
}
```

:::note
This tool reads the entire file content. For large files, consider using `syno_file_list` to inspect metadata first.
:::

---

### syno_file_write

Write or upload a file to the Synology NAS.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `folder_path` | string | Yes | Parent folder path (e.g., `/Documents`) |
| `filename` | string | Yes | Name of the file to create |
| `content` | string | Yes | File content as text |

**Permission check**: `enforcer.check("write", folder_path)`.

---

### syno_file_delete

Delete a file or folder on the Synology NAS.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `file_path` | string | Yes | — | Full path to delete |
| `recursive` | boolean | No | `false` | Recursively delete folders and their contents |

**Permission check**: `enforcer.check("write", file_path)`.

**⚠️ Caution**: Deletions via the DSM API are permanent (not moved to a recycle bin). Be explicit in your path rules and audit log monitoring.

---

### syno_file_move

Move or rename a file or folder on the Synology NAS.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `src_path` | string | Yes | Source path (current location) |
| `dst_path` | string | Yes | Destination path (new location or name) |

**Permission check**: `enforcer.check("write", src_path)` + `enforcer.check("write", dst_path)`.

---

### syno_file_search

Search for files by name pattern on the Synology NAS.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | — | Search query (name pattern, supports `*` and `?` wildcards) |
| `folder_path` | string | No | `/` | Folder to search within |

**Permission check**: `enforcer.check("read", folder_path)`.

**Example request**:
```
Search the NAS for all PDF files under /Documents
```

**Example output**:
```json
{
  "results": [
    {"name": "report.pdf", "path": "/Documents/report.pdf", "size": 245000},
    {"name": "invoice.pdf", "path": "/Documents/Finance/invoice.pdf", "size": 89000}
  ],
  "count": 2
}
```

---

### syno_system_info

Get Synology NAS system information: model, DSM version, CPU, RAM, temperature, and uptime.

**No parameters required.**

**Permission check**: `enforcer.check_command("syno_system_info")` — must match an allowlisted pattern.

**Example output**:
```json
{
  "model": "DS920+",
  "dsm_version": "DSM 7.2.1-69057 Update 3",
  "cpu": "Intel Celeron J4125",
  "memory_mb": 8192,
  "temperature_c": 42,
  "uptime": "30 days, 5:12:00"
}
```

---

### syno_storage_info

Get storage information: volumes, usage, and disk health.

**No parameters required.**

**Permission check**: `enforcer.check_command("syno_storage_info")`.

**Example output**:
```json
{
  "volumes": [
    {
      "name": "Volume 1",
      "total_gb": 8000,
      "used_gb": 3200,
      "filesystem": "btrfs",
      "status": "normal",
      "disks": [
        {"model": "WD Red 4TB", "status": "healthy", "temp_c": 35},
        {"model": "WD Red 4TB", "status": "healthy", "temp_c": 36}
      ]
    }
  ]
}
```

---

### syno_list_shares

List all shared folders on the Synology NAS.

**No parameters required.**

**Example output**:
```json
{
  "shares": ["Documents", "Photos", "Music", "Video", "Backup"],
  "count": 5
}
```

## Configuration

Edit `configs/synology-nas.yaml`:

```yaml
server:
  name: synology-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: none
  paths:
    - path: "/Documents/**"
      access: read
      description: "Read access to Documents share"
    - path: "/Documents/Uploads/**"
      access: write
      description: "Write access to Uploads folder"
    - path: "/Backup/**"
      access: read
      description: "Read access to Backup share"
  commands:
    - pattern: "syno_system_info"
      access: active
      description: "Allow system info queries"
    - pattern: "syno_storage_info"
      access: active
      description: "Allow storage info queries"
  default_command_access: none
```

## Environment Variables

Set these in `.env`:

```bash
SYNOLOGY_NAS_HOST=192.168.1.100
SYNOLOGY_NAS_PORT=5001
SYNOLOGY_NAS_USER=your-nas-username
SYNOLOGY_NAS_PASSWORD=your-nas-password
SYNOLOGY_NAS_OTP_SECRET=  # Only if 2FA is enabled
```

## Authentication Flow

1. On startup, the MCP calls `SYNO.API.Auth` with username and password
2. If 2FA is enabled: the OTP secret is used to generate a TOTP code (RFC 6238), sent with the second auth request
3. The DSM API returns a session ID (SID), used for all subsequent requests
4. If a request returns 401 (session expired), the client automatically re-authenticates
5. On shutdown, `SYNO.API.Auth` is called to logout (invalidate session)
