---
sidebar_position: 5
---

# Tool Enforcement

The `check_tool()` method is used by proxy servers to gate access to upstream MCP tools. It uses fnmatch glob patterns against tool names.

## When Tool Enforcement Applies

Tool enforcement is specific to **proxy servers** like GitHub MCP. These servers wrap external MCP servers and need to control which of the upstream tools are available.

Direct MCP servers (Ubuntu, Obsidian, Synology) don't use tool enforcement: they define their own tools and use path/command enforcement instead.

## Implementation

```python
def check_tool(self, tool_name: str) -> bool:
    rules = self._config.permissions.tools
    default = self._config.permissions.default_tool_access

    for rule in rules:
        if fnmatch.fnmatch(tool_name, rule.pattern):
            if rule.access == AccessLevel.NONE:
                self._audit.denied(...)
                raise ForbiddenError(
                    f"Tool denied: '{tool_name}' matches deny rule '{rule.pattern}'"
                )
            self._audit.allowed(...)
            return True

    # No matching rule — use default
    if default == AccessLevel.NONE:
        raise ForbiddenError(
            f"Tool denied: '{tool_name}' is not in the allowlist"
        )
    return True
```

## Pattern Examples

```yaml
tools:
  # Allow all search operations
  - pattern: "search_*"
    access: active

  # Allow specific operations
  - pattern: "get_file_contents"
    access: active
  - pattern: "list_commits"
    access: active
  - pattern: "list_issues"
    access: active

  # Explicitly deny destructive operations
  - pattern: "delete_file"
    access: none
  - pattern: "merge_pull_request"
    access: none
  - pattern: "push_files"
    access: none
```

## Combined with User-Level Tool Restrictions

Tool enforcement at the config level is separate from user-level tool restrictions in `users.yaml`:

1. **User tool check** (`check_tool_access()`): Is the user allowed to use this MCP tool at all?
2. **Tool enforcement** (`check_tool()`): Is this specific proxy tool allowed by the config?

Both must pass. A user might have access to the GitHub MCP but be blocked from using `merge_pull_request` by the tool rules.
