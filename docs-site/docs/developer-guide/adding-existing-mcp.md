---
sidebar_position: 3
---

# Adding an Existing MCP

How to wrap an existing MCP server (Python, Node.js, Go, etc.) so it works with the Swiss Army Knife permission engine, config system, and Web UI.

## Requirements

For an external MCP to integrate cleanly, it needs:

1. **Stdio transport** — the MCP protocol uses stdin/stdout
2. **Docker image** — all servers run as containers
3. **Config YAML** — a template with permission rules specific to the server

## Non-Python MCPs

The permission engine is Python, but your MCP server doesn't have to be. Common patterns:

### Option A: Sidecar Proxy

Run a thin Python proxy alongside the non-Python MCP that intercepts tool calls and enforces permissions:

```
[Claude] → stdio → [Python Permission Proxy] → HTTP/local → [Node.js MCP]
```

The proxy:
1. Receives tool calls from Claude via stdio
2. Checks permissions via `PermissionEnforcer`
3. Forwards allowed calls to the real MCP (HTTP, Unix socket, or subprocess)
4. Returns results to Claude

### Option B: Subprocess Wrapper

If the MCP also uses stdio, wrap it as a subprocess:

```python
import subprocess
from permission_engine import PermissionEnforcer

# Spawn the real MCP as a subprocess
proc = subprocess.Popen(
    ["node", "my-mcp-server.js"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
)
# Relay messages with permission checks in between
```

### Option C: Library Integration

If the MCP is in a language with MCP SDK support (Python, TypeScript, Kotlin), call the permission engine directly. The Python permission engine can be called via:

- **Subprocess**: `python -c "from permission_engine import ..."` (simple, slow)
- **HTTP microservice**: Wrap the engine in a tiny Flask/FastAPI server
- **Unix socket**: Same as HTTP but local-only

## Config Template

Create `configs/templates/<name>.yaml` regardless of the MCP's language:

```yaml
server:
  name: "<name>"
  log_level: "INFO"
  audit_log: "/var/log/mcp/audit.log"

permissions:
  default_access: "none"
  paths: []
  commands: []
  default_command_access: "none"
```

At minimum, define the server name and log path. Permission rules can be added by users through the Web UI.

## Web UI Registration

To show the server in the Web UI, update these files:

### 1. `mcp-webui/src/lib/types.ts`

```typescript
export type ServerName = "ubuntu-server" | "obsidian" | "synology-nas" | "<name>";

export const SERVER_LABELS: Record<ServerName, string> = {
  // ... existing entries
  "<name>": "Display Name",
};

export const SERVER_ICONS: Record<ServerName, string> = {
  // ... existing entries
  "<name>": "🔧",
};
```

### 2. `mcp-webui/src/lib/config.ts`

```typescript
const valid = ["ubuntu-server", "obsidian", "synology-nas", "<name>"];
```

### 3. `docker-compose.yml`

Add the service definition (see Creating a New MCP Server guide).

## Config Watcher

All servers should support hot-reload. If wrapping a non-Python MCP, implement the watcher in Python:

```python
# config_watcher.py
import time
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ConfigHandler(FileSystemEventHandler):
    def __init__(self, enforcer):
        self.enforcer = enforcer

    def on_modified(self, event):
        if event.src_path.endswith(".yaml"):
            self.enforcer.reload()

def start_watcher(config_path: str, enforcer: PermissionEnforcer):
    handler = ConfigHandler(enforcer)
    observer = Observer()
    observer.schedule(handler, str(Path(config_path).parent), recursive=False)
    observer.start()
    return observer
```

## Testing

Add a smoke test that verifies:

1. The config template is valid YAML and passes Pydantic validation
2. The Docker image builds successfully
3. The server starts and responds to a basic tool call

See `mcp-servers/ubuntu-server/tests/test_smoke.py` for an example.
