---
sidebar_position: 5
---

# GitHub MCP

Access GitHub through Claude Code with tool-level permission gating. The GitHub MCP proxies the official `@modelcontextprotocol/server-github` package and adds the shared permission engine on top.

## Overview

Unlike the other MCP servers which implement their own tools, the GitHub MCP is a **proxy server**. It spawns the upstream GitHub MCP server as a subprocess and forwards requests through the permission engine. Every GitHub API tool is gated by tool rules in the YAML config.

| Property | Value |
|---|---|
| **Module** | `server` (proxy) |
| **Entry point** | `python -m server` |
| **Config** | `configs/github-mcp.yaml` |
| **Container** | `github-mcp` |
| **Upstream** | `@modelcontextprotocol/server-github` (npx) |
| **Tools** | 20+ (all GitHub API operations) |
| **Permission** | Tool rules (fnmatch patterns on tool names) |

## How the Proxy Works

```
Claude Code ──▶ github-mcp ──▶ Permission check ──▶ @modelcontextprotocol/server-github ──▶ GitHub API
                  │                                        │
                  │  ┌──────────────────────┐              │
                  │  │ Tool rules (YAML)    │              │
                  │  │ search_repos: active │              │
                  │  │ merge_pr: none       │              │
                  │  └──────────────────────┘              │
                  │                                        │
                  └── Audit log ◀──────────────────────────┘
```

1. Claude Code sends a tool call request
2. The proxy performs user authentication and tool access check
3. The proxy forwards the request to the upstream GitHub MCP subprocess
4. The response is passed back to Claude Code
5. Every call is audit-logged

## Pre-Configured Tool Restrictions

By default, the GitHub MCP blocks destructive operations. These tools require explicit `active` access in the config:

| Tool | Default | Risk |
|---|---|---|
| `merge_pull_request` | `none` | Merges PRs |
| `delete_file` | `none` | Deletes files from repos |
| `push_files` | `none` | Pushes commits to repos |
| `create_pull_request` | `none` | Creates new PRs |
| `fork_repository` | `none` | Forks repos |
| `create_repository` | `none` | Creates new repos |

Read-only tools (search, get, list) are typically set to `active` by default.

## Configuration

Edit `configs/github-mcp.yaml`:

```yaml
server:
  name: github-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

proxy:
  command: npx
  args:
    - "-y"
    - "@modelcontextprotocol/server-github"
  env:
    GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"

permissions:
  default_tool_access: none
  tools:
    # Search and read — safe operations
    - pattern: "search_repositories"
      access: active
      description: "Search GitHub repos"
    - pattern: "search_code"
      access: active
      description: "Search code across GitHub"
    - pattern: "search_issues"
      access: active
      description: "Search issues and PRs"
    - pattern: "search_users"
      access: active
      description: "Search GitHub users"
    - pattern: "get_file_contents"
      access: active
      description: "Read file contents"
    - pattern: "list_commits"
      access: active
      description: "List commits on a branch"
    - pattern: "list_branches"
      access: active
      description: "List branches in a repo"
    - pattern: "list_issues"
      access: active
      description: "List issues in a repo"
    - pattern: "get_issue"
      access: active
      description: "Read a single issue"
    - pattern: "get_pull_request"
      access: active
      description: "Read a single PR"
    - pattern: "list_pull_requests"
      access: active
      description: "List PRs in a repo"
    - pattern: "get_me"
      access: active
      description: "Get authenticated user info"

    # Write operations — allow with caution
    - pattern: "create_pull_request"
      access: active
      description: "Create pull requests"
    - pattern: "create_issue"
      access: active
      description: "Create issues"
    - pattern: "create_or_update_file"
      access: active
      description: "Create or update a single file"
```

## GitHub Token Setup

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a token with these permissions:
   - **Repository access**: Select repositories you want the MCP to access
   - **Permissions**: `Contents: Read-only`, `Issues: Read and write`, `Pull requests: Read and write`, `Metadata: Read-only`
3. Copy the token and set `GITHUB_TOKEN` in your `.env`:

```bash
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx
```

:::caution
Use a fine-grained token with the minimum permissions needed. If you only need search access, grant `Metadata: Read-only` only.
:::

## Custom Hooks

The GitHub MCP supports custom hooks for filtering and transforming tool calls. Hooks are defined in `mcp-servers/github/src/custom/__init__.py`:

```python
def register(proxy):
    @proxy.hook("on_tools_cached")
    def filter_tools(tools):
        # Remove tools you never want exposed
        blocked = {"merge_pull_request", "delete_file"}
        return [t for t in tools if t["name"] not in blocked]

    @proxy.hook("on_before_tool_call")
    def before_call(name, arguments):
        # Modify or reject tool calls before execution
        return name, arguments
```

See the [Proxy Server Framework](/dev/proxy-server/hook-system) developer docs for details on the hook system.
