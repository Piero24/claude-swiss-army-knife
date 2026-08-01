---
sidebar_position: 6
---

# Testing MCP Servers

How to test MCP servers at the unit, integration, and smoke-test level.

## Smoke Tests

Each MCP server has a `tests/test_smoke.py` that verifies basic functionality:

```python
def test_server_imports():
    """Verify the server module can be imported."""
    from ubuntu_mcp.server import UbuntuServer
    assert UbuntuServer is not None

def test_tools_list():
    """Verify tools are registered correctly."""
    from ubuntu_mcp.server import UbuntuServer
    # Would need a mock config file
```

## Testing with the Permission Engine

The permission engine has extensive tests in `mcp-servers/shared/mcp-permission-engine/tests/`:

| Test File | What It Tests |
|---|---|
| `test_config.py` | YAML loading, env var substitution, model validation |
| `test_enforcer.py` | `check()`, `check_command()`, authentication |
| `test_resolver.py` | Path glob matching, deny override, default access |
| `test_audit.py` | JSON Lines writing, log format |
| `test_users.py` | Key hashing, access modes, tool restrictions |

## Running Tests

```bash
# Permission engine tests
cd mcp-servers/shared/mcp-permission-engine
python -m pytest tests/ -v

# Ubuntu MCP tests
cd mcp-servers/ubuntu-server
python -m pytest tests/ -v

# Web UI tests
cd mcp-webui
npm test
```

## CI Pipeline

The GitHub Actions CI workflow (`.github/workflows/ci.yml`) runs:

1. **Python lint**: pylint on all MCP server source
2. **Python test**: pytest for the permission engine
3. **TypeScript typecheck**: `tsc --noEmit` for the Web UI
4. **Web UI test**: vitest for the Web UI
5. **Web UI build**: `next build` to verify production build
6. **Docker build**: Verify all Dockerfiles build successfully
