---
sidebar_position: 1
---

# Base Server Class

`BaseMCPServer` is the abstract base class for all MCP servers. It provides the standard lifecycle: config loading, permission engine initialization, tool call wrapping, and hot reload.

## Class Definition

```python
class BaseMCPServer:
    def __init__(self, name: str, config_path: str):
        self._name = name
        self._config_path = Path(config_path).resolve()
        self.server = Server(name)
        self.enforcer = PermissionEnforcer(str(self._config_path))

    async def reload_config(self):
        self.enforcer.reload()

    async def handle_tool_call(self, name, arguments, dispatch_fn):
        # Authentication → tool check → dispatch → result
        ...

    def format_result(self, data):
        return [TextContent(type="text", text=json.dumps(data, indent=2))]

    def format_error(self, error):
        return [TextContent(type="text", text=str(error), is_error=True)]
```

## Lifecycle

1. **Construction**: Load config, create `Server` and `PermissionEnforcer`
2. **Setup**: Subclass calls `self.setup()` which registers `list_tools()` and `call_tool()` handlers
3. **Run**: `stdio_server()` context manager starts the MCP server
4. **Reload**: Config watcher calls `reload_config()` on YAML changes
5. **Shutdown**: Watcher is cancelled, server loop exits

## handle_tool_call() Flow

This is the central method that wraps every tool invocation:

```
handle_tool_call(name, arguments, dispatch_fn)
  │
  ├── Read MCP_USER_ID, MCP_USER_KEY, CLAUDE_AGENT_ID from env
  ├── Set context variables (_current_user_id, _observed_subagent_id)
  │
  ├── 1. authenticate(user_id, user_key)
  │     └── Raises AuthenticationError on invalid credentials
  │
  ├── 2. is_server_enabled()
  │     └── Checks settings.json for server.enabled flag
  │
  ├── 3. check_tool_access(user_id, tool_name)
  │     └── Checks user's tool allowlist and access mode
  │
  ├── 4. dispatch_fn(name, arguments)
  │     └── Subclass-specific dispatch to tool handlers
  │
  └── 5. format_result(result) or format_error(exception)
```

## Error Handling

The base class catches all exceptions and converts them to MCP error responses:

```python
try:
    self.enforcer.authenticate(user_id, user_key)
except AuthenticationError as e:
    return self.format_error(e)

try:
    result = await dispatch_fn(name, arguments)
    return self.format_result(result)
except ForbiddenError as e:
    return self.format_error(e)
except Exception as e:
    logger.exception("Tool call failed")
    return self.format_error(e)
```

The MCP client (Claude Code) receives these as structured error messages with the exception message and type.
