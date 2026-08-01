---
sidebar_position: 1
---

# Proxy Server Architecture

The MCP Proxy framework wraps external MCP servers (like `@modelcontextprotocol/server-github`) and adds the shared permission engine on top. This lets you use third-party MCP servers with the same default-deny, audit-logged access control.

## Architecture

```
Claude Code ──▶ ProxyServer ──▶ PermissionEnforcer ──▶ Subprocess (external MCP)
                   │                                          │
                   │  ┌──────────────────────┐                │
                   │  │ Tool rules (YAML)    │                │
                   │  │ search_*: active     │                │
                   │  │ merge_pr: none       │                │
                   │  └──────────────────────┘                │
                   │                                          │
                   └── Audit log ─────────────────────────────┘
```

## ProxyServer Class

```python
class ProxyServer(BaseMCPServer):
    def __init__(self, config_path: str):
        # Load raw config to extract proxy section
        self._raw_config = yaml.safe_load(open(config_path))
        super().__init__(self._raw_config["server"]["name"], config_path)

        self._proc = None           # Subprocess handle
        self._tools_cache = []      # Cached tool list
        self._request_id = 0        # JSON-RPC request counter
        self._hooks = {}            # Hook system
```

## Subprocess Lifecycle

The proxy spawns the external MCP server as a subprocess and communicates via JSON-RPC over stdio:

```python
async def _ensure_subprocess(self):
    if self._proc is not None and self._proc.returncode is None:
        return  # Already running

    cfg = self._proxy_config()
    env = {**os.environ, **cfg.env}

    self._proc = await asyncio.create_subprocess_exec(
        cfg.command,
        *cfg.args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
```

## Tool Caching

On first request, the proxy initializes the subprocess and caches its tool list:

```python
async def _initialize_and_cache(self):
    await self._ensure_subprocess()
    init = await self._send_request("initialize", {...})
    tools_resp = await self._send_request("tools/list")
    self._tools_cache = tools_resp["result"]["tools"]
```

## Configuration

```yaml
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
    - pattern: "list_*"
      access: active
```
