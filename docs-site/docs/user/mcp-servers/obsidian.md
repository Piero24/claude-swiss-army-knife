---
sidebar_position: 3
---

# Obsidian MCP

Read, write, and search your Obsidian vault notes through Claude Code. Full frontmatter parsing, wikilink resolution, and ripgrep-powered full-text search.

## Overview

The Obsidian MCP gives Claude Code access to your Obsidian vault files. It mounts the vault directory as a Docker volume and operates on plain `.md` files. Frontmatter is parsed as YAML, and `[[wikilinks]]` are resolved to actual file paths.

| Property | Value |
|---|---|
| **Module** | `obsidian_mcp` |
| **Entry point** | `python -m obsidian_mcp` |
| **Config** | `configs/obsidian.yaml` |
| **Container** | `obsidian-mcp` |
| **Vault path** | `/data/vaults` (mapped from `OBSIDIAN_VAULT_PATH`) |
| **Tools** | 9 |

## Tools Reference

### obsidian_list_vault

List the vault directory structure.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|
| `subfolder` | string | No | root | Subfolder to list |
| `depth` | integer | No | `3` | Maximum recursion depth |

**Permission check**: `enforcer.check("read", subfolder)` — the subfolder path must match a read rule.

**Example output**:
```json
{
  "entries": [
    {"name": "Daily", "type": "dir"},
    {"name": "Projects", "type": "dir"},
    {"name": "README.md", "type": "file"}
  ],
  "count": 3
}
```

---

### obsidian_read_note

Read a note's full content with parsed frontmatter.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Path relative to vault root |

**Permission check**: `enforcer.check("read", path)`.

**Example output**:
```json
{
  "path": "Projects/my-project.md",
  "frontmatter": {
    "title": "My Project",
    "tags": ["project", "active"],
    "created": "2026-01-15"
  },
  "body": "# My Project\n\nProject description here...\n\n## Tasks\n- [ ] Task 1\n- [x] Task 2"
}
```

---

### obsidian_write_note

Create or update a note. If the note exists, it is overwritten.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Path relative to vault root |
| `content` | string | Yes | Markdown content (body only) |
| `frontmatter` | object | No | YAML frontmatter to merge into the note |

**Permission check**: `enforcer.check("write", path)`.

If `frontmatter` is provided, it is serialized as YAML and prepended to the content.

**Example request**:
```
Create a note at Daily/2026-01-15.md with content "## Tasks\n- Write docs\n- Review PR" and frontmatter tags: ["daily"]
```

---

### obsidian_delete_note

Delete a note. By default, notes are soft-deleted to `.trash/` inside the vault.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|
| `path` | string | Yes | — | Path relative to vault root |
| `permanent` | boolean | No | `false` | If true, delete permanently instead of moving to `.trash/` |

**Permission check**: `enforcer.check("write", path)`.

**Example output**:
```json
{
  "deleted": true,
  "path": "old-note.md",
  "trash_path": ".trash/old-note.md"
}
```

---

### obsidian_search_notes

Full-text search across all notes using ripgrep. Supports regex queries.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | — | Search query (supports regex) |
| `max_results` | integer | No | `20` | Maximum results to return |
| `regex` | boolean | No | `false` | Treat query as a regex pattern |

**Permission check**: `enforcer.check("read", "/")` + `enforcer.check_command("rg *")`.

**Example request**:
```
Search my vault for notes mentioning "docker compose"
```

**Example output**:
```json
{
  "results": [
    {"file": "Projects/infra.md", "line": 42, "snippet": "docker compose up -d"},
    {"file": "Notes/deploy.md", "line": 15, "snippet": "Use docker compose for orchestration"}
  ],
  "count": 2
}
```

---

### obsidian_search_by_tag

Find all notes with a specific frontmatter tag.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tag` | string | Yes | Tag to search for |

**Permission check**: `enforcer.check("read", "/")`.

**Example request**:
```
Find all notes tagged with "project"
```

**Example output**:
```json
{
  "tag": "project",
  "results": [
    {"path": "Projects/my-project.md", "title": "My Project", "tags": ["project", "active"]},
    {"path": "Projects/old-project.md", "title": "Old Project", "tags": ["project", "archived"]}
  ],
  "count": 2
}
```

---

### obsidian_get_backlinks

Find notes that link to a target note via `[[wikilinks]]`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Target note path (relative to vault root) |

**Permission check**: `enforcer.check("read", path)`.

**Example request**:
```
What notes link to Projects/my-project.md?
```

**Example output**:
```json
{
  "target": "Projects/my-project.md",
  "backlinks": [
    {"file": "Daily/2026-01-15.md", "title": "2026-01-15"},
    {"file": "README.md", "title": "README"}
  ],
  "count": 2
}
```

---

### obsidian_get_tags

List all unique tags used across the vault, with usage counts.

**No parameters required.**

**Permission check**: `enforcer.check("read", "/")`.

**Example output**:
```json
{
  "tags": [
    {"tag": "project", "count": 15},
    {"tag": "daily", "count": 120},
    {"tag": "reference", "count": 45}
  ]
}
```

---

### obsidian_get_frontmatter

Read only the YAML frontmatter of a note (without the body content).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Path relative to vault root |

**Permission check**: `enforcer.check("read", path)`.

**Example output**:
```json
{
  "path": "Projects/my-project.md",
  "frontmatter": {
    "title": "My Project",
    "tags": ["project", "active"],
    "created": "2026-01-15",
    "status": "in-progress"
  }
}
```

## Configuration

Edit `configs/obsidian.yaml`:

```yaml
server:
  name: obsidian-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: read
  paths:
    - path: "**"
      access: read
      description: "Read access to entire vault"
    - path: "Daily/**"
      access: write
      description: "Write access to daily notes"
    - path: "Projects/**"
      access: write
      description: "Write access to project notes"
```

:::tip
A common setup is `default_access: read` with specific write access to folders where Claude should create or edit notes (like `Daily/` and `Projects/`).
:::

## Volume Mount

The vault is mounted at `/data/vaults` inside the container, mapped from `OBSIDIAN_VAULT_PATH` in your `.env`:

```yaml
volumes:
  - ${OBSIDIAN_VAULT_PATH:-/DATA/obsidian-vaults}:/data/vaults:rw
```
