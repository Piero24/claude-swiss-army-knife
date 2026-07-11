"""Smoke tests for ubuntu-mcp server — verify imports and permission engine integration."""

import tempfile
from pathlib import Path

import pytest
import yaml
from permission_engine.config import load_config
from permission_engine.enforcer import PermissionEnforcer


MINIMAL_CONFIG = {
    "server": {
        "name": "ubuntu-mcp",
        "log_level": "DEBUG",
        "audit_log": "/tmp/ubuntu-smoke-test.log",
    },
    "permissions": {
        "default_access": "none",
        "paths": [
            {"path": "/home/**", "access": "read"},
            {"path": "/var/www/**", "access": "write"},
        ],
        "commands": [
            {"pattern": "systemctl status *", "access": "read"},
            {"pattern": "systemctl restart nginx", "access": "write"},
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
    log_file = Path("/tmp/ubuntu-smoke-test.log")
    if log_file.exists():
        log_file.unlink()


class TestPermissionEngineIntegration:
    """Verify the permission engine works with ubuntu-server config."""

    def test_config_loads(self, config_path):
        config = load_config(config_path)
        assert config.server.name == "ubuntu-mcp"
        assert config.permissions.default_access.value == "none"

    def test_read_allowed(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        assert enforcer.check("read", "/home/user/docs/file.txt") is True

    def test_read_denied_outside_paths(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        with pytest.raises(Exception):
            enforcer.check("read", "/etc/shadow")

    def test_write_denied_on_read_only(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        with pytest.raises(Exception):
            enforcer.check("write", "/home/user/docs/file.txt")

    def test_write_allowed(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        assert enforcer.check("write", "/var/www/index.html") is True

    def test_allowlisted_command(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        assert enforcer.check_command("systemctl status nginx") is True

    def test_denied_command(self, config_path):
        enforcer = PermissionEnforcer(config_path)
        with pytest.raises(Exception):
            enforcer.check_command("rm -rf /")


class TestModuleImports:
    """Verify core modules can be imported."""

    def test_import_server(self):
        import ubuntu_mcp.server  # noqa: F401

    def test_import_path_mapper(self):
        import ubuntu_mcp.path_mapper  # noqa: F401

    def test_import_config_watcher(self):
        import ubuntu_mcp.config_watcher  # noqa: F401

    def test_import_tools_package(self):
        import ubuntu_mcp.tools  # noqa: F401
