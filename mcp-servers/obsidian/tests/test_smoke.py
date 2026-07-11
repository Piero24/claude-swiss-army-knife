"""Smoke tests for obsidian-mcp server — verify imports and permission engine integration."""

import tempfile
from pathlib import Path

import pytest
import yaml
from permission_engine.config import load_config
from permission_engine.enforcer import PermissionEnforcer


MINIMAL_CONFIG = {
    "server": {
        "name": "obsidian-mcp",
        "log_level": "DEBUG",
        "audit_log": "/tmp/obsidian-smoke-test.log",
    },
    "permissions": {
        "default_access": "none",
        "paths": [
            {"path": "/data/vaults/**", "access": "write"},
        ],
        "commands": [],
        "default_command_access": "none",
    },
}


@pytest.fixture
def config_path():
    """Create a minimal config file for testing."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as f:
        yaml.dump(MINIMAL_CONFIG, f)
        path = f.name
    yield path
    Path(path).unlink()
    log_file = Path("/tmp/obsidian-smoke-test.log")
    if log_file.exists():
        log_file.unlink()


class TestPermissionEngineIntegration:
    """Verify the permission engine works with obsidian-mcp config."""

    def test_config_loads(self, config_path):
        config = load_config(config_path)
        assert config.server.name == "obsidian-mcp"
        assert config.permissions.default_access.value == "none"

    def test_vault_read_allowed(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        assert enforcer.check("read", "/data/vaults/notes/note.md") is True

    def test_vault_write_allowed(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        assert enforcer.check("write", "/data/vaults/notes/note.md") is True

    def test_outside_vault_denied(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        with pytest.raises(Exception):
            enforcer.check("read", "/etc/passwd")


class TestModuleImports:
    """Verify core modules can be imported."""

    def test_import_server(self):
        import obsidian_mcp.server  # noqa: F401

    def test_import_vault(self):
        import obsidian_mcp.vault  # noqa: F401

    def test_import_frontmatter(self):
        import obsidian_mcp.frontmatter  # noqa: F401

    def test_import_wikilinks(self):
        import obsidian_mcp.wikilinks  # noqa: F401

    def test_import_config_watcher(self):
        import obsidian_mcp.config_watcher  # noqa: F401
