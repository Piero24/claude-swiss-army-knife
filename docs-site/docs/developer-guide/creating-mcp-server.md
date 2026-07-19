---
sidebar_position: 2
---

# Creating a New MCP Server

Step-by-step guide to building an MCP server from scratch that integrates with the Swiss Army Knife suite.

## 1. Project Structure

Create your server under `mcp-servers/<name>/`:

```
mcp-servers/<name>/
├── Dockerfile
├── pyproject.toml
├── src/<name>_mcp/
│   ├── __init__.py
│   ├── __main__.py
│   ├── server.py
│   ├── config_watcher.py
│   └── tools/
│       └── __init__.py
└── tests/
    ├── __init__.py
    └── test_smoke.py
```

## 2. pyproject.toml

```toml
[build-system]
requires = ["setuptools>=75.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "<name>-mcp"
version = "1.0.0"
requires-python = ">=3.12"
dependencies = [
    "mcp-permission-engine",
    "mcp>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.24"]

[tool.setuptools.packages.find]
where = ["src"]
```

## 3. Entry Point (`__main__.py`)

```python
"""Entry point for the MCP server — called via `python -m <name>_mcp`."""
import sys
from .server import main

if __name__ == "__main__":
    sys.exit(main())
```

## 4. MCP Server (`server.py`)

```python
"""MCP server — loads config, registers tools, runs stdio loop."""
import asyncio
import os
import sys
from pathlib import Path

from mcp.server import Server, stdio_server
from permission_engine import PermissionEnforcer

from .tools import register_tools

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/app/config.yaml")


def main() -> int:
    """Bootstrap and run the MCP server."""
    if not Path(CONFIG_PATH).exists():
        print(f"Config not found: {CONFIG_PATH}", file=sys.stderr)
        return 1

    enforcer = PermissionEnforcer(CONFIG_PATH)
    server = Server(enforcer.config.server.name)
    register_tools(server, enforcer)

    asyncio.run(stdio_server(server))
    return 0
```

## 5. Tools

Each tool function receives the enforcer and checks permissions before executing:

```python
"""Tool implementations."""
from mcp.server import Server
from permission_engine import PermissionEnforcer


def register_tools(server: Server, enforcer: PermissionEnforcer) -> None:
    """Register all MCP tools on the server instance."""

    @server.tool()
    async def read_file(path: str) -> str:
        """Read a file from the filesystem."""
        enforcer.check("read", path, tool="read_file")
        with open(enforcer.safe_resolve_path(
            path, "/mnt/host", ["/home", "/var/www"]
        )) as f:
            return f.read()
```

## 6. Dockerfile

```dockerfile
FROM python:3.12-slim

ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine
WORKDIR /app

# Install permission engine
COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && rm -rf /tmp/permission-engine

# Install server
COPY pyproject.toml .
RUN pip install --no-cache-dir -e . && pip cache purge

COPY src/ src/

ENTRYPOINT ["python", "-m", "<name>_mcp"]
```

## 7. Config Template

Create a config template in `configs/templates/<name>.yaml`:

```yaml
server:
  name: "<name>"
  log_level: "INFO"
  audit_log: "/var/log/mcp/audit.log"

permissions:
  default_access: "none"
  paths:
    - id: "allow-home"
      path: "/home/**"
      access: "read"
      description: "Read access to home directories"
  commands:
    - id: "allow-systemctl-status"
      pattern: "systemctl status *"
      access: "read"
      description: "Read-only systemd status checks"
  default_command_access: "none"
```

## 8. Docker Compose Integration

Add your service to `docker-compose.yml`:

```yaml
  <name>-mcp:
    build:
      context: ./mcp-servers/<name>
      args:
        PERMISSION_ENGINE_PATH: shared/mcp-permission-engine
    image: <name>-mcp:${<NAME>_MCP_IMAGE_TAG:-latest}
    container_name: ${<NAME>_MCP_CONTAINER:-<name>-mcp}
    volumes:
      - ./configs/<name>.yaml:/app/config.yaml:ro
      - ${MCP_LOG_DIR:-/var/log/mcp}/<name>:/var/log/mcp
    stdin_open: true
    restart: unless-stopped
```

## 9. Smoke Test

```python
"""Smoke test — verifies the server starts and tools are registered."""
import pytest


def test_config_loads():
    """Verify the config template is valid."""
    from permission_engine import load_config
    config = load_config("configs/templates/<name>.yaml")
    assert config.server.name == "<name>"
    assert len(config.permissions.paths) >= 1
```

## 10. Web UI Integration

To expose your server in the Web UI, add it to:

- `mcp-webui/src/lib/types.ts` — `ServerName` type and `SERVER_LABELS`/`SERVER_ICONS` maps
- `mcp-webui/src/lib/config.ts` — `getConfigPath()` valid server list
- `docker-compose.yml` — add the service definition
- `configs/templates/` — create a config template
