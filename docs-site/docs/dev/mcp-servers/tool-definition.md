---
sidebar_position: 3
---

# Tool Definition API

How to define and register MCP tools using the `mcp` Python SDK.

## Tool Schema

Each tool is defined as a `Tool` object with a JSON Schema for its input:

```python
from mcp.types import Tool

Tool(
    name="ubuntu_read_file",
    description="Read a file from the Ubuntu server filesystem.",
    inputSchema={
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute path to the file on the host.",
            },
        },
        "required": ["path"],
    },
)
```

## Registration

Tools are registered in the server's `setup()` method using decorators:

```python
def setup(self):
    @self.server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(name="tool_one", ...),
            Tool(name="tool_two", ...),
        ]

    @self.server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        return await self.handle_tool_call(name, arguments, self._dispatch)
```

## Dispatch Pattern

Use `match/case` for clean routing:

```python
async def _dispatch(self, name: str, arguments: dict) -> dict:
    match name:
        case "ubuntu_read_file":
            return await read_file.read_file(arguments, self.enforcer, ...)
        case "ubuntu_write_file":
            return await write_file.write_file(arguments, self.enforcer, ...)
        case _:
            raise ValueError(f"Unknown tool: {name}")
```

## Input Schema Best Practices

- Always include `"type": "object"` at the top level
- Mark required parameters in the `"required"` array
- Provide descriptions for every parameter
- Use `"enum"` for parameters with a fixed set of values
- Use `"default"` for parameters with sensible defaults

## Permission Integration

Always call the enforcer in your tool handler:

```python
async def read_file(arguments, enforcer, mount_prefix, tool_name):
    path = arguments["path"]

    # Permission check (will raise ForbiddenError if denied)
    enforcer.check("read", path, tool_name)

    # Path resolution (block traversal attempts)
    resolved = enforcer.safe_resolve_path(path, mount_prefix, allowed_bases)

    # Do the work
    content = resolved.read_text()
    return {"path": path, "content": content}
```

The permission check should happen **before** any work is done. If the check fails, no files are read, no commands are run, no API calls are made.
