---
sidebar_position: 2
---

# Building a New MCP Server

Step-by-step guide to creating a new MCP server that integrates with the permission engine.

## Step 1: Create Directory Structure

```bash
mkdir -p mcp-servers/my-service/src/my_service_mcp
mkdir -p mcp-servers/my-service/tests
```

## Step 2: Create pyproject.toml

```toml
[project]
name = "my-service-mcp"
version = "1.0.0"
requires-python = ">=3.12"
dependencies = [
    "mcp>=1.0",
    "mcp-permission-engine",
    "structlog>=24.0",
    "watchfiles>=0.24",
]

[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.backends._legacy:_Backend"
```

## Step 3: Create the Server Class

```python
# src/my_service_mcp/server.py
from mcp.types import Tool, TextContent
from permission_engine import BaseMCPServer

class MyServiceServer(BaseMCPServer):
    def __init__(self, config_path: str):
        super().__init__("my-service-mcp", config_path)
        self.setup()

    def setup(self):
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return [
                Tool(
                    name="myservice_do_thing",
                    description="Do something useful.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "param1": {
                                "type": "string",
                                "description": "First parameter.",
                            },
                        },
                        "required": ["param1"],
                    },
                ),
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            return await self.handle_tool_call(name, arguments, self._dispatch)

    async def _dispatch(self, name: str, arguments: dict) -> dict:
        match name:
            case "myservice_do_thing":
                # Permission check
                self.enforcer.check("read", arguments.get("param1", "/"), name)
                # Do the work
                return {"result": f"Processed {arguments['param1']}"}
            case _:
                raise ValueError(f"Unknown tool: {name}")
```

## Step 4: Create Entry Point

```python
# src/my_service_mcp/__main__.py
import argparse, asyncio, logging
from pathlib import Path
from mcp.server.stdio import stdio_server
from .server import MyServiceServer
from .config_watcher import watch_config

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/app/config.yaml")
    args = parser.parse_args()

    app = MyServiceServer(str(Path(args.config).resolve()))
    watch_task = asyncio.create_task(watch_config(Path(args.config), app.reload_config))

    async with stdio_server() as (read_stream, write_stream):
        await app.server.run(read_stream, write_stream, app.server.create_initialization_options())

    watch_task.cancel()

if __name__ == "__main__":
    asyncio.run(main())
```

## Step 5: Create Dockerfile

```dockerfile
FROM python:3.12-slim
ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine
COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
RUN pip install /tmp/permission-engine && rm -rf /tmp/permission-engine
COPY pyproject.toml /app/
COPY src/ /app/src/
RUN pip install /app/
WORKDIR /app
ENTRYPOINT ["python", "-m", "my_service_mcp"]
```

## Step 6: Add Config Template

```yaml
# configs/templates/my-service.yaml
server:
  name: my-service-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: none
  paths:
    - path: /**
      access: read
  default_command_access: none
```

## Step 7: Add to Docker Compose

```yaml
# docker-compose.yml
services:
  my-service-mcp:
    build:
      context: ./mcp-servers/my-service
      args:
        PERMISSION_ENGINE_PATH: shared/mcp-permission-engine
    image: my-service-mcp:latest
    container_name: my-service-mcp
    volumes:
      - ./configs/my-service.yaml:/app/config.yaml:ro
      - ./configs/users.yaml:/app/users.yaml:ro
    stdin_open: true
    restart: unless-stopped
```

## Step 8: Register in Web UI

Add your server to `mcp-webui/src/lib/servers.ts`:

```typescript
{
  name: "my-service",
  label: "My Service",
  icon: "🔧",
}
```

## Step 9: Write Tests

```python
# tests/test_smoke.py
def test_server_imports():
    from my_service_mcp.server import MyServiceServer
    assert MyServiceServer is not None
```

Run: `python -m pytest tests/`
