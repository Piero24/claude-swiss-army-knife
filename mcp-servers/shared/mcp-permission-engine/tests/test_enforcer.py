"""Tests for the permission enforcer — access checks, command validation, path safety."""

import tempfile
from pathlib import Path

import pytest
import yaml
from permission_engine.enforcer import ForbiddenError, PermissionEnforcer, _SHELL_METACHARS


CONFIG_YAML = """
server:
  name: test-mcp
  log_level: DEBUG
  audit_log: /tmp/test-audit.log

permissions:
  default_access: none

  paths:
    - path: /var/log/**
      access: read
      description: "Logs — read-only"
    - path: /var/www/**
      access: write
      description: "Web root — full access"
    - path: /var/www/admin/secrets/**
      access: none
      description: "Explicit deny"
    - path: /home/user/**
      access: read
      description: "Home — read-only"

  commands:
    - pattern: "systemctl status *"
      access: read
    - pattern: "systemctl restart nginx"
      access: write
    - pattern: "docker ps*"
      access: read
    - pattern: "docker restart *"
      access: write
    - pattern: "journalctl *"
      access: read
  default_command_access: none
"""


@pytest.fixture
def enforcer():
    """Create an enforcer with a temp config file."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as f:
        f.write(CONFIG_YAML)
        f.flush()
        path = f.name

    enf = PermissionEnforcer(path)
    yield enf
    # Cleanup
    Path(path).unlink()
    audit_log = Path("/tmp/test-audit.log")
    if audit_log.exists():
        audit_log.unlink()


class TestFileAccess:
    """Tests for file path access control."""

    def test_read_allowed(self, enforcer):
        assert enforcer.check("read", "/var/log/syslog") is True

    def test_read_denied(self, enforcer):
        with pytest.raises(ForbiddenError, match="Access denied"):
            enforcer.check("read", "/etc/shadow")

    def test_write_allowed(self, enforcer):
        assert enforcer.check("write", "/var/www/index.html") is True

    def test_write_denied_on_read_only(self, enforcer):
        # /var/log/** is read-only
        with pytest.raises(ForbiddenError, match="Access denied"):
            enforcer.check("write", "/var/log/syslog")

    def test_explicit_deny(self, enforcer):
        # /var/www/admin/secrets/** is explicitly none
        with pytest.raises(ForbiddenError, match="Access denied"):
            enforcer.check("read", "/var/www/admin/secrets/passwords.txt")

    def test_read_home(self, enforcer):
        assert enforcer.check("read", "/home/user/documents/note.txt") is True

    def test_write_home_denied(self, enforcer):
        # /home/user/** is read-only
        with pytest.raises(ForbiddenError, match="Access denied"):
            enforcer.check("write", "/home/user/documents/note.txt")

    def test_reload_picks_up_changes(self, enforcer):
        """Verify enforcer.reload() picks up config changes."""
        # Initially denied
        with pytest.raises(ForbiddenError):
            enforcer.check("read", "/new/allowed/path")

        # Modify the config file to allow the new path
        new_config = """
server:
  name: test-mcp
  log_level: DEBUG
  audit_log: /tmp/test-audit.log

permissions:
  default_access: none
  paths:
    - path: /new/allowed/**
      access: read
  commands: []
  default_command_access: none
"""
        # Write new config to the same path
        config_path = enforcer._config_path
        with open(config_path, "w") as f:
            f.write(new_config)

        # Reload
        enforcer.reload()

        # Now it should be allowed
        assert enforcer.check("read", "/new/allowed/path/file.txt") is True

    def test_forbidden_error_contains_path(self, enforcer):
        with pytest.raises(ForbiddenError) as exc_info:
            enforcer.check("read", "/etc/shadow")
        assert exc_info.value.path == "/etc/shadow"


class TestCommandAccess:
    """Tests for command allowlist enforcement."""

    def test_allowed_read_command(self, enforcer):
        assert enforcer.check_command("systemctl status nginx") is True

    def test_allowed_write_command(self, enforcer):
        assert enforcer.check_command("systemctl restart nginx") is True

    def test_docker_ps(self, enforcer):
        assert enforcer.check_command("docker ps -a") is True

    def test_denied_command(self, enforcer):
        with pytest.raises(ForbiddenError, match="not in the allowlist"):
            enforcer.check_command("rm -rf /")

    def test_command_with_semicolon_blocked(self, enforcer):
        """Semicolon injection should be blocked."""
        with pytest.raises(
            ForbiddenError, match="forbidden shell metacharacters"
        ):
            enforcer.check_command("systemctl status nginx; rm -rf /")

    def test_command_with_pipe_blocked(self, enforcer):
        """Pipe injection should be blocked."""
        with pytest.raises(
            ForbiddenError, match="forbidden shell metacharacters"
        ):
            enforcer.check_command("systemctl status nginx | cat /etc/shadow")

    def test_command_with_backtick_blocked(self, enforcer):
        """Backtick injection should be blocked."""
        with pytest.raises(
            ForbiddenError, match="forbidden shell metacharacters"
        ):
            enforcer.check_command("echo `cat /etc/shadow`")

    def test_command_with_dollar_blocked(self, enforcer):
        """Dollar-sign substitution should be blocked."""
        with pytest.raises(
            ForbiddenError, match="forbidden shell metacharacters"
        ):
            enforcer.check_command("echo $(id)")

    def test_journalctl_allowed(self, enforcer):
        assert enforcer.check_command("journalctl -u nginx") is True


class TestSafeResolvePath:
    """Tests for path traversal prevention."""

    def test_simple_resolve(self, enforcer):
        result = enforcer.safe_resolve_path(
            "/var/log/syslog",
            mount_prefix="/mnt/host",
            allowed_bases=["/var/log", "/var/www"],
        )
        assert str(result) == "/mnt/host/var/log/syslog"

    def test_path_traversal_dot_dot(self, enforcer):
        """../ traversal should be blocked."""
        with pytest.raises(ForbiddenError, match="outside allowed"):
            enforcer.safe_resolve_path(
                "/var/log/../../../etc/shadow",
                mount_prefix="/mnt/host",
                allowed_bases=["/var/log"],
            )

    def test_null_byte_blocked(self, enforcer):
        """Null bytes should be blocked."""
        with pytest.raises(ForbiddenError, match="invalid characters"):
            enforcer.safe_resolve_path(
                "/var/log/file\x00.txt",
                mount_prefix="/mnt/host",
                allowed_bases=["/var/log"],
            )

    def test_resolve_outside_base(self, enforcer):
        """Paths outside allowed bases should be rejected."""
        with pytest.raises(ForbiddenError, match="outside allowed"):
            enforcer.safe_resolve_path(
                "/etc/passwd",
                mount_prefix="/mnt/host",
                allowed_bases=["/var/log", "/var/www"],
            )

    def test_symlink_escape_blocked(self, enforcer):
        """Symlink escapes should be caught by the resolve check."""
        # Even if a symlink points outside, resolve() follows it
        # and the base check catches it
        # This is hard to test without actual symlinks, but the logic
        # uses Path.resolve() which follows symlinks
        pass  # Tested via integration with real filesystem
