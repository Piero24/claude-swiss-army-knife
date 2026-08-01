---
sidebar_position: 3
---

# Managing Permissions

The server detail page is where you control which files, commands, and tools each MCP server can access. Access the detail page by clicking a server card on the dashboard.

![Server Detail Page](/img/screenshots/server-detail.png)

## Page Sections

Each server detail page has up to four sections, depending on the server type:

| Section | Available for | Controls |
|---|---|---|
| **Path Permissions** | Ubuntu, Obsidian, Synology | Filesystem paths (none/read/write) |
| **Command Permissions** | Ubuntu, Synology | Shell commands (none/active) |
| **Tool Permissions** | GitHub (proxy servers) | API tool names (none/active) |
| **Audit Log** | All servers | Access decision history |

Sections can be shown or hidden per server from the [Settings](/user/webui/settings) page.

## Path Permissions

### Folder Tree View

The folder tree displays discovered folders with their current access level. Each folder shows a toggle group:

- **None**: Denied (default)
- **Read**: Can list and read files
- **Write**: Can create, update, and delete files (implies read)

### Cascading Access

When you change a folder's access level, all child folders with a higher access level are cascaded down. For example, setting `/var/www` to `read` will also set `/var/www/admin` to `read` if it was previously `write`. This is a single atomic operation through the API.

### Bulk Set

The "Set all" buttons (none/read/write) change every path rule at once. A confirmation dialog appears showing the number of rules that will be affected.

### Adding Rules

Click the "Add" button to open a dialog where you can specify:
- **Path**: Glob pattern like `/var/log/**` or exact path like `/etc/hosts`
- **Description**: Optional human-readable note
- **Access Level**: none, read, or write

### Deleting Rules

Click the trash icon on any rule to remove it. This cannot be undone, but the rule can be re-added.

### Filtering

- **Text search**: Filter paths by name or full path
- **Access filter**: Show only paths with a specific access level (All/None/Read/Write)

### Scanning Folders

Click "Scan folders" to auto-discover the directory structure on the server. New folders are added as path rules with the default access level. Use this after adding new directories or applications to your server.

Scan progress is shown in the button and header. Scanning can be cancelled. The last scan time is saved in your browser.

## Command Permissions

The command permissions table shows each allowed command pattern with its access level:

- **None**: Command cannot be executed
- **Active**: Command can be executed

**Pattern examples:**
- `systemctl status *` — matches `systemctl status nginx`, `systemctl status docker`
- `docker ps*` — matches `docker ps`, `docker ps -a`
- `systemctl restart nginx` — matches only that exact command

Patterns use shell-style globbing (`*` matches anything within a single word, `?` matches one character). Shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`, etc.) are always blocked regardless of pattern matching.

### Adding Command Rules

Click "Add Command" to open a dialog for:
- **Pattern**: The command glob pattern
- **Description**: Optional note
- **Access**: none or active

## Tool Permissions (Proxy Servers)

For GitHub MCP and other proxy servers, the Tool Permissions section controls which upstream MCP tools are allowed:

- **None**: Tool is denied
- **Active**: Tool is allowed

Tool rules use the same fnmatch glob patterns as command rules (e.g., `search_*` matches `search_repositories`, `search_code`, etc.).

## Server Stats Bar

At the top of the server detail page, a stats bar shows:
- Total request count
- Today's request count
- 7-day request count
- Allowed vs denied counts
- Top tools by usage
- Request breakdown by user

## Server Deactivation

When a server is deactivated from the dashboard, its detail page shows a warning banner. Tools are unavailable until the server is reactivated. Deactivation is a soft toggle: the container keeps running, but the MCP server refuses all requests.

## Deactivated Server Warning

![Server Deactivated](/img/screenshots/server-detail.png)

A yellow banner explains that the server is disabled and tools are unavailable. Reactivate from the dashboard to restore access.
