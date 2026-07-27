---
sidebar_position: 6
---

# Settings

The Settings page controls the Web UI's behavior: scan frequency, folder discovery exclusions, audit log display, and server page section visibility.

![Settings Page](/img/screenshots/settings.png)

## Scan Settings

### Auto-Scan Interval

How often the Web UI automatically scans each server for new folders (in minutes). Default: 5.

Set to a higher value (15-30) on servers with large filesystems to reduce scan overhead. Set to 0 to disable automatic scanning entirely.

### Exclude Patterns

Folder name patterns to skip during folder scans. These are case-sensitive exact name matches.

Default exclusion list:

| Pattern | Reason |
|---|---|
| `.venv`, `venv` | Python virtual environments |
| `__pycache__` | Python bytecode cache |
| `.git` | Git repositories |
| `node_modules` | Node.js dependencies |
| `.next` | Next.js build output |
| `.DS_Store` | macOS metadata |
| `.pytest_cache`, `.mypy_cache` | Test/lint caches |
| `lost+found` | Ext filesystem recovery |
| `.Trash`, `#recycle` | Trash/recycle bin folders |
| `@eaDir` | Synology metadata |

Add or remove patterns as needed. For example, to also skip `backup` and `tmp` folders, add them to the list.

Click "Add pattern" to add a new entry, then click "Save settings" to persist.

## Audit Log Settings

### Entries Per Page

Number of audit log entries shown per page in the audit log viewer. Options: 50, 100, 150. Default: 50.

Higher values load more data at once but reduce the need for pagination.

## Server Page Sections

For each MCP server, you can toggle which sections appear on its detail page:

- **Paths**: The folder tree and path rules table
- **Commands**: The command rules table
- **Tools**: The tool rules table (proxy servers only)
- **Audit**: The audit log viewer

Disable sections you don't use to simplify the interface. For example, if you only use Ubuntu MCP for file operations, you might hide the Commands and Audit sections.

Section visibility is stored in each server's YAML config under a `ui.sections` key:

```yaml
# configs/ubuntu-server.yaml
ui:
  label: "Ubuntu Server"
  icon: "🖥"
  sections:
    paths: true
    commands: true
    tools: false
    audit: true
```

## Saving Settings

All settings changes require clicking "Save settings" at the bottom of the page. Settings are written to `configs/settings.json` and take effect immediately.
