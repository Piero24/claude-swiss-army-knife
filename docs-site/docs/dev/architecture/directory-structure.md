---
sidebar_position: 2
---

# Directory Structure

A walkthrough of every directory in the repository and its purpose.

## Top-Level Layout

```
claude-swiss-army-knife/
├── .env.example                # Environment variable template
├── docker-compose.yml          # Main Docker Compose (8 services)
├── compose-casaos.yaml         # CasaOS appliance Compose
├── pyproject.toml              # Python tooling config (pyink, pylint)
├── package.json                # Root (just recharts dep, unused directly)
├── push-all.sh                 # Deployment helper script
├── .github/                    # CI workflows and issue templates
├── scripts/                    # Utility shell scripts
├── configs/                    # Permission YAML and templates
├── mcp-servers/                # All MCP server source code
├── mcp-webui/                  # Next.js 15 Web UI
└── docs-site/                  # Docusaurus 3 documentation
```

## mcp-servers/

Each server follows the same pattern:

```
mcp-servers/<server>/
├── Dockerfile                  # Multi-stage Python build
├── pyproject.toml              # Package metadata and dependencies
├── config.yaml.example         # Example permission config
├── src/<server>_mcp/           # Python package
│   ├── __init__.py            # Package docstring
│   ├── __main__.py            # python -m entry point
│   ├── server.py              # Main server class (extends BaseMCPServer)
│   ├── config_watcher.py      # Hot-reload via watchfiles
│   ├── discover.py            # Folder scanning for Web UI
│   └── tools/                 # Tool implementation modules
│       └── __init__.py
└── tests/
    ├── __init__.py
    └── test_smoke.py
```

### ubuntu-server/

The most complex MCP server with 12 tools:

| File | Purpose |
|---|---|
| `server.py` | `UbuntuServer` class: tool registration, dispatch, config loading |
| `path_mapper.py` | `PathMapper`: translates host paths (`/var/log`) to container paths (`/mnt/host/var/log`) |
| `tools/read_file.py` | Path validation, file reading via `safe_resolve_path` |
| `tools/write_file.py` | Content write with permission check |
| `tools/append_file.py` | Append mode file writing |
| `tools/list_dir.py` | Directory listing with recursive option |
| `tools/execute.py` | Command execution with shell injection prevention |
| `tools/system_info.py` | psutil-based CPU/RAM/disk/load/uptime queries |
| `tools/service.py` | systemd service status and management |
| `tools/docker_mgmt.py` | Docker ps, logs, restart via Docker CLI |
| `config_watcher.py` | watchfiles-based hot reload |
| `discover.py` | Folder structure discovery for Web UI tree |

### obsidian/

| File | Purpose |
|---|---|
| `server.py` | `ObsidianServer` class: 9 tools for vault management |
| `vault.py` | `Vault` class: filesystem operations, path safety, note enumeration |
| `frontmatter.py` | YAML frontmatter parsing, building, tag extraction, title detection |
| `wikilinks.py` | `[[wikilink]]` extraction and backlink resolution across vault |
| `discover.py` | Folder discovery |

### synology-nas/

| File | Purpose |
|---|---|
| `server.py` | `SynologyServer` class: 9 tools for NAS management |
| `dsm_client.py` | `DSMClient`: httpx-based DSM 7.x REST API client with TOTP auth |
| `discover.py` | Shared folder discovery |

### github/

| File | Purpose |
|---|---|
| `server.py` | Entry point: delegates to `ProxyServer` |
| `custom/__init__.py` | GitHub-specific hooks: filter destructive tools, on_tools_cached |

### shared/

| Directory | Purpose |
|---|---|
| `mcp-permission-engine/` | Core permission library used by all servers |
| `mcp-proxy/` | Generic proxy framework for wrapping external MCP servers |

## mcp-permission-engine/src/permission_engine/

| File | Purpose |
|---|---|
| `__init__.py` | Public API: exports `BaseMCPServer`, `PermissionEnforcer`, models, context vars |
| `models.py` | Pydantic v2 schemas: `AccessLevel`, `PathRule`, `CommandRule`, `ToolRule`, `ServerConfig`, `ProxyConfig` |
| `config.py` | `ConfigLoader`: YAML loading with `!ENV` env var substitution |
| `enforcer.py` | `PermissionEnforcer`: core access checks (paths, commands, tools), `safe_resolve_path`, auth |
| `resolver.py` | `PathResolver`: glob matching, longest-match precedence, explicit-deny override |
| `audit.py` | `AuditLogger`: JSON Lines audit trail writer |
| `users.py` | User authentication: SHA-256 salted keys, access modes (open/allowlist/blocklist) |
| `server.py` | `BaseMCPServer`: abstract base class for all MCP servers |

## mcp-webui/src/

| Path | Purpose |
|---|---|
| `middleware.ts` | Auth guard: checks iron-session cookie for all `/api/*` routes |
| `app/layout.tsx` | Root layout: dark theme, Toaster provider |
| `app/page.tsx` | Dashboard: server cards, health, stats, bulk actions |
| `app/login/page.tsx` | API key login form |
| `app/[server]/page.tsx` | Server detail: path tree, commands, tools, audit log |
| `app/agents/page.tsx` | User management: mode selector, user table, key generation |
| `app/settings/page.tsx` | App settings: scan interval, excludes, page size, sections |
| `app/api/` | REST API routes (see [API Routes](/dev/webui/api-routes)) |
| `components/` | Reusable UI components (see [Components](/dev/webui/components)) |
| `lib/` | API client, types, auth, config utilities |

## docs-site/docs/

```
docs/
├── user/                        # User Guide
│   ├── intro.md
│   ├── getting-started/         # 5 pages
│   ├── mcp-servers/             # 5 pages
│   ├── webui/                   # 7 pages
│   ├── security/                # 4 pages
│   ├── deployment/              # 4 pages
│   └── troubleshooting/         # 3 pages
└── dev/                         # Developer Guide
    ├── architecture/            # 3 pages
    ├── permission-engine/       # 8 pages
    ├── mcp-servers/             # 6 pages
    ├── proxy-server/            # 4 pages
    ├── webui/                   # 7 pages
    ├── docs-site/               # 3 pages
    └── contributing/            # 5 pages
```
