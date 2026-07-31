---
sidebar_position: 4
---

# Proxy Configuration

Reference for the `ProxyConfig` schema used by proxy servers.

## Schema

```python
class ProxyConfig(BaseModel):
    command: str                          # Executable to run
    args: list[str] = []                  # Arguments
    env: dict[str, str] = {}              # Environment variables
```

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `command` | string | Yes | Executable to run (e.g., `npx`, `node`, `python`) |
| `args` | list[string] | No | Arguments passed to the command |
| `env` | dict | No | Environment variables for the subprocess |

## Environment Variable Substitution

Variables in the `env` dict support `${ENV_VAR}` substitution, resolved against the host environment:

```yaml
proxy:
  env:
    GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"
```

The `${GITHUB_TOKEN}` is resolved from the environment where the MCP server runs (i.e., the Docker container's environment, set from `.env`).

## Full Config Example

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
    - pattern: "search_*"
      access: active
    - pattern: "get_*"
      access: active
    - pattern: "list_*"
      access: active
```

## Multiple Proxy Instances

Since each proxy server is a separate Docker container, you can run multiple proxy instances with different configurations:

```yaml
# docker-compose.yml
services:
  github-mcp:
    # GitHub proxy config
  gitlab-mcp:
    # GitLab proxy config (same ProxyServer, different upstream)
```
