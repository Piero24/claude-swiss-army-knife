---
sidebar_position: 3
---

# Building a Proxy MCP

Step-by-step guide to creating a new proxy MCP server that wraps an external MCP and adds permission gating.

## 1. Create Directory Structure

```bash
mkdir -p mcp-servers/my-proxy/src/custom
```

## 2. Create Entry Point

```python
# mcp-servers/my-proxy/src/server.py
import argparse, asyncio, logging
from mcp.server.stdio import stdio_server
from mcp_proxy import ProxyServer

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/app/config.yaml")
    args = parser.parse_args()

    proxy = ProxyServer(args.config)
    proxy.setup()

    async with stdio_server() as (read_stream, write_stream):
        await proxy.server.run(read_stream, write_stream, ...)

if __name__ == "__main__":
    asyncio.run(main())
```

## 3. Add Custom Hooks

```python
# mcp-servers/my-proxy/src/custom/__init__.py
def register(proxy):
    @proxy.hook("on_tools_cached")
    def filter_tools(tools):
        # Custom tool filtering logic
        return tools

    @proxy.hook("on_before_tool_call")
    def before_call(name, arguments):
        # Custom pre-call logic
        return name, arguments
```

## 4. Create Config Template

```yaml
# configs/templates/my-proxy.yaml
server:
  name: my-proxy-mcp

proxy:
  command: npx
  args: ["-y", "@scope/external-mcp-server"]
  env:
    API_TOKEN: "${MY_API_TOKEN}"

permissions:
  default_tool_access: none
  tools:
    - pattern: "read_*"
      access: active
    - pattern: "list_*"
      access: active
```

## 5. Create Dockerfile

```dockerfile
FROM python:3.12-slim
ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine
ARG PROXY_PATH=shared/mcp-proxy
COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
COPY ${PROXY_PATH} /tmp/proxy
RUN pip install /tmp/permission-engine /tmp/proxy
RUN apt-get update && apt-get install -y nodejs npm
COPY src/ /app/src/
WORKDIR /app
ENTRYPOINT ["python", "-m", "server"]
```

Note the Node.js installation: proxy servers that run npx need Node.js in the container.
