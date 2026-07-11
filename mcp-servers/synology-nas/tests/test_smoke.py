"""Smoke tests for synology-mcp server — verify imports and permission engine integration."""

import tempfile
from pathlib import Path

import pytest
import yaml
from permission_engine.config import load_config
from permission_engine.enforcer import PermissionEnforcer


MINIMAL_CONFIG = {
    "server": {
        "name": "synology-mcp",
        "log_level": "DEBUG",
        "audit_log": "/tmp/synology-smoke-test.log",
    },
    "permissions": {
        "default_access": "none",
        "paths": [],
        "commands": [
            {"pattern": "dsm *", "access": "read"},
        ],
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
    log_file = Path("/tmp/synology-smoke-test.log")
    if log_file.exists():
        log_file.unlink()


class TestPermissionEngineIntegration:
    """Verify the permission engine works with synology-mcp config."""

    def test_config_loads(self, config_path):
        config = load_config(config_path)
        assert config.server.name == "synology-mcp"
        assert config.permissions.default_access.value == "none"

    def test_allowlisted_command(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        assert enforcer.check_command("dsm status") is True

    def test_denied_command(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        with pytest.raises(Exception):
            enforcer.check_command("rm -rf /")


class TestModuleImports:
    """Verify core modules can be imported."""

    def test_import_server(self):
        import synology_mcp.server  # noqa: F401

    def test_import_dsm_client(self):
        import synology_mcp.dsm_client  # noqa: F401

    def test_import_config_watcher(self):
        import synology_mcp.config_watcher  # noqa: F401
