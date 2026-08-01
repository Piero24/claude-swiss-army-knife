---
sidebar_position: 2
---

# Hook System

The proxy server's hook system lets you customize tool behavior per proxy implementation. Hooks are registered in a `custom/` module and triggered at specific points in the request lifecycle.

## Available Hooks

| Hook | When | Signature |
|---|---|---|
| `on_tools_cached` | After tools are fetched from subprocess | `(tools: list) -> list` |
| `on_before_tool_call` | Before a tool call is forwarded | `(name, arguments) -> (name, arguments)` |
| `on_after_tool_call` | After a tool call completes | `(name, result) -> result` |

## Registering Hooks

### Using Decorators

```python
def register(proxy):
    @proxy.hook("on_tools_cached")
    def filter_tools(tools):
        # Remove tools you never want exposed
        blocked = {"merge_pull_request", "delete_file"}
        return [t for t in tools if t["name"] not in blocked]
```

### Using hook() Method

```python
def register(proxy):
    def block_destructive(name, arguments):
        if name == "delete_file":
            raise ValueError("Delete operations are disabled")
        return name, arguments

    proxy.hook("on_before_tool_call", block_destructive)
```

## GitHub MCP Example

```python
# mcp-servers/github/src/custom/__init__.py
def register(proxy):
    @proxy.hook("on_tools_cached")
    def filter_tools(tools):
        # Block destructive tools at the tool list level
        blocked = {"merge_pull_request", "delete_file", "push_files"}
        return [t for t in tools if t["name"] not in blocked]
```

## Loading Custom Modules

The proxy automatically tries to import `custom` or `src.custom`:

```python
def _load_custom(self):
    for module_name in ("custom", "src.custom"):
        try:
            custom = importlib.import_module(module_name)
            if hasattr(custom, "register"):
                custom.register(self)
                return
        except ImportError:
            pass
```

## Hook Execution

Hooks are triggered via `_trigger()`:

```python
async def _trigger(self, name, *args, **kwargs):
    result = None
    for fn in self._hooks.get(name, []):
        ret = fn(*args, **kwargs)
        if asyncio.iscoroutine(ret):
            ret = await ret
        if ret is not None:
            result = ret
    return result
```

Multiple hooks can be registered for the same event. They execute in registration order. The last non-None return value wins.
