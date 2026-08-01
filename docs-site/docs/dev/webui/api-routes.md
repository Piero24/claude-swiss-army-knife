---
sidebar_position: 4
---

# API Routes Reference

Complete reference for the Web UI REST API. All routes are protected by the auth middleware (`middleware.ts`) which checks for a valid iron-session cookie.

## Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth` | Login with API key. Body: `{ apiKey: string }`. Sets session cookie. |
| `DELETE` | `/api/auth` | Logout. Clears session cookie. |
| `GET` | `/api/auth` | Check current session validity. |

## Config (Per-Server)

All config routes are scoped to a server parameter:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config/{server}` | Get full server config |
| `PUT` | `/api/config/{server}` | Replace full server config |
| `POST` | `/api/config/{server}/paths` | Add path rule. Body: `{ path, access, description? }` |
| `PATCH` | `/api/config/{server}/paths/{ruleId}` | Update path rule access. Body: access level |
| `DELETE` | `/api/config/{server}/paths/{ruleId}` | Delete path rule |
| `POST` | `/api/config/{server}/commands` | Add command rule. Body: `{ pattern, access, description? }` |
| `PATCH` | `/api/config/{server}/commands/{ruleId}` | Update command rule access |
| `DELETE` | `/api/config/{server}/commands/{ruleId}` | Delete command rule |
| `POST` | `/api/config/{server}/tools` | Add tool rule. Body: `{ pattern, access, description? }` |
| `PATCH` | `/api/config/{server}/tools/{ruleId}` | Update tool rule access |
| `DELETE` | `/api/config/{server}/tools/{ruleId}` | Delete tool rule |
| `PATCH` | `/api/config/{server}/bulk` | Bulk set all paths or commands. Body: `{ access, type }` |
| `PATCH` | `/api/config/{server}/cascade` | Cascade path access to children. Body: `{ ruleId, access }` |

## Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents` | Get users config (mode + user list) |
| `PUT` | `/api/agents` | Update users settings (mode). Body: `{ mode }` |
| `PATCH` | `/api/agents/{id}` | Update user. Body: `{ enabled?, tools?, key? }` |

## Audit

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/audit/{server}` | Get audit log entries. Query: `?limit=50&offset=0` |

## Health & Status

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health/{server}` | Get container health status |
| `PATCH` | `/api/servers/{server}/status` | Enable/disable server. Body: `{ enabled: boolean }` |
| `GET` | `/api/servers/status` | Get all server statuses |

## Scan

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scan/{server}` | Trigger folder scan |
| `POST` | `/api/scan/{server}/cancel` | Cancel running scan |
| `GET` | `/api/scan-status` | Get current scan status. Response: `{ scanning, server }` |

## Folders

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/folders/{server}` | Get discovered folder tree. Response: `{ folders: FolderNode[], server, count }` |

## Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Get app settings. Response: `{ scan, auditPageSize }` |
| `PUT` | `/api/settings` | Update app settings |
