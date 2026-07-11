# Security Model

The MCP Server Suite uses a defense-in-depth security approach.

## Principles

- **Default deny**: All access is denied by default
- **Explicit grants**: Permissions must be explicitly granted
- **Path traversal prevention**: All file paths are validated
- **Shell injection prevention**: Command metacharacters are blocked
- **Structured audit logging**: All access decisions are logged
