---
sidebar_position: 3
---

# Communication Flow

A detailed trace of how a request travels from Claude Code to an MCP server and back.

## Tool Call Lifecycle

```
1. User asks Claude Code
   "Show me the nginx error log"
        │
2. Claude Code → MCP Server (JSON-RPC over SSH + docker exec)
   {
     "jsonrpc": "2.0",
     "id": 42,
     "method": "tools/call",
     "params": {
       "name": "ubuntu_read_file",
       "arguments": {"path": "/var/log/nginx/error.log"}
     }
   }
        │
3. SSH → docker exec -i ubuntu-mcp python -m ubuntu_mcp
   (stdin receives the JSON-RPC request)
        │
4. UbuntuServer.handle_tool_call() receives the call
        │
5. User authentication
   enforcer.authenticate(user_id, user_key)
   → Loads users.yaml, validates SHA-256 key
   → Sets _current_user_id context variable
        │
6. Tool access check
   enforcer.check_tool_access(user_id, "ubuntu_read_file")
   → Checks user's tool allowlist (users.yaml → user.tools)
   → Checks access mode (open/allowlist/blocklist)
        │
7. Dispatch to tool handler
   _dispatch("ubuntu_read_file", {"path": "/var/log/nginx/error.log"})
   → match/case routes to tools/read_file.py
        │
8. Permission check
   enforcer.check("read", "/var/log/nginx/error.log")
   → PathResolver checks glob patterns in config
   → Longest-match wins, explicit deny overrides
   → Result: GRANTED (matched "/var/log/**" with access: read)
   → AuditLogger writes allowed entry
        │
9. Path resolution
   safe_resolve_path("/var/log/nginx/error.log", "/mnt/host", allowed_bases)
   → Converts to /mnt/host/var/log/nginx/error.log
   → Verifies within allowed base /mnt/host/var/log
        │
10. File read
    open("/mnt/host/var/log/nginx/error.log").read()
        │
11. Response returned
    {
      "content": [
        {
          "type": "text",
          "text": "{\"path\": \"/var/log/nginx/error.log\", \"content\": \"...\"}"
        }
      ]
    }
        │
12. JSON-RPC response → stdout → docker exec → SSH → Claude Code
        │
13. Claude Code formats and presents to user
    "The nginx error log shows..."
```

## Key Components in the Flow

### BaseMCPServer.handle_tool_call()

The central method that wraps every tool call. Located in `permission_engine/server.py`:

```python
async def handle_tool_call(self, name, arguments, dispatch_fn):
    user_id = os.environ.get("MCP_USER_ID", "default")
    user_key = os.environ.get("MCP_USER_KEY", "")

    _current_user_id.set(user_id)
    _observed_subagent_id.set(os.environ.get("CLAUDE_AGENT_ID", ""))

    # 1. Authenticate
    try:
        self.enforcer.authenticate(user_id, user_key)
    except Exception as e:
        return self.format_error(e)

    # 2. Check server enabled
    if not self.enforcer.is_server_enabled():
        return self.format_error(ForbiddenError("Server is disabled"))

    # 3. Check tool access (user-level)
    try:
        self.enforcer.check_tool_access(user_id, name)
    except Exception as e:
        return self.format_error(e)

    # 4. Dispatch to specific handler (which does its own permission checks)
    try:
        result = await dispatch_fn(name, arguments)
        return self.format_result(result)
    except Exception as e:
        return self.format_error(e)
```

### PermissionEnforcer.check()

The filesystem access check in `enforcer.py`:

```python
def check(self, required_access, path, tool=""):
    required = AccessLevel(required_access)
    granted = self._path_resolver.resolve(path)

    if not granted.grants(required):
        self._audit.denied(...)
        raise ForbiddenError(...)

    self._audit.allowed(...)
    return True
```

### PermissionEnforcer.check_command()

The command execution check:

```python
def check_command(self, command, tool=""):
    # 1. Block shell metacharacters
    if _SHELL_METACHARS.search(command):
        raise ForbiddenError("command contains forbidden shell metacharacters")

    # 2. Match against allowlist
    for rule in self._config.permissions.commands:
        if fnmatch.fnmatch(command, rule.pattern):
            if rule.access == AccessLevel.NONE:
                raise ForbiddenError("command explicitly denied")
            return True

    # 3. No match — use default
    if self._config.permissions.default_command_access == AccessLevel.NONE:
        raise ForbiddenError("command not in allowlist")
    return True
```

## Config Hot-Reload Flow

```
Web UI writes configs/ubuntu-server.yaml
        │
watchfiles detects change (inotify event)
        │
config_watcher triggers callback
        │
BaseMCPServer.reload_config()
  → enforcer.reload()
    → ConfigLoader.load()  # re-reads YAML
    → PathResolver.__init__(new_rules)  # rebuilds rule tree
    → AuditLogger.__init__(new_path)  # reopens log file
        │
Next request uses new config (atomic swap)
Total time: < 1 second
```
