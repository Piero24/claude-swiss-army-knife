"""Tests for config loading, env var substitution, and validation."""

import os
import tempfile
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError
from permission_engine.config import ConfigLoader, _resolve_env_vars, load_config
from permission_engine.models import AccessLevel, ServerConfig


VALID_CONFIG_YAML = """
server:
  name: test-mcp
  log_level: INFO
  audit_log: /var/log/mcp/audit.log

permissions:
  default_access: none
  paths:
    - path: /var/log/**
      access: read
      description: "System logs"
    - path: /var/www/**
      access: write
      description: "Web root"
    - path: /var/www/admin/secrets/**
      access: none
      description: "Explicit deny"
  commands:
    - pattern: "systemctl status *"
      access: read
    - pattern: "systemctl restart nginx"
      access: write
    - pattern: "docker ps*"
      access: read
  default_command_access: none
"""


class TestEnvVarSubstitution:
    """Tests for ${ENV_VAR} resolution."""

    def test_simple_substitution(self, monkeypatch):
        monkeypatch.setenv("MY_VAR", "hello")
        result = _resolve_env_vars("prefix_${MY_VAR}_suffix")
        assert result == "prefix_hello_suffix"

    def test_default_value_used(self):
        result = _resolve_env_vars("${MISSING_VAR:-default_value}")
        assert result == "default_value"

    def test_missing_var_without_default(self):
        result = _resolve_env_vars("${MISSING_VAR}")
        assert result == ""

    def test_multiple_vars(self, monkeypatch):
        monkeypatch.setenv("A", "1")
        monkeypatch.setenv("B", "2")
        result = _resolve_env_vars("${A}_${B}")
        assert result == "1_2"

    def test_no_substitution_needed(self):
        result = _resolve_env_vars("plain_string")
        assert result == "plain_string"


class TestConfigLoader:
    """Tests for ConfigLoader."""

    def test_load_valid_config(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(VALID_CONFIG_YAML)
            f.flush()
            path = f.name

        try:
            loader = ConfigLoader(path)
            config = loader.load()

            assert config.server.name == "test-mcp"
            assert config.server.log_level == "INFO"
            assert config.permissions.default_access == AccessLevel.NONE
            assert len(config.permissions.paths) == 3
            assert config.permissions.paths[0].path == "/var/log/**"
            assert config.permissions.paths[0].access == AccessLevel.READ
            assert config.permissions.paths[1].access == AccessLevel.WRITE
            assert config.permissions.paths[2].access == AccessLevel.NONE
            assert len(config.permissions.commands) == 3
            assert config.permissions.default_command_access == AccessLevel.NONE
        finally:
            Path(path).unlink()

    def test_load_file_not_found(self):
        loader = ConfigLoader("/nonexistent/path.yaml")
        with pytest.raises(FileNotFoundError):
            loader.load()

    def test_load_empty_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("")
            f.flush()
            path = f.name

        try:
            loader = ConfigLoader(path)
            with pytest.raises(ValueError, match="empty"):
                loader.load()
        finally:
            Path(path).unlink()

    def test_load_invalid_yaml(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("{{{ invalid yaml {{{")
            f.flush()
            path = f.name

        try:
            loader = ConfigLoader(path)
            with pytest.raises(Exception):
                loader.load()
        finally:
            Path(path).unlink()

    def test_load_invalid_schema(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("""
server:
  name: test
permissions:
  default_access: invalid_value
""")
            f.flush()
            path = f.name

        try:
            loader = ConfigLoader(path)
            with pytest.raises(ValidationError):
                loader.load()
        finally:
            Path(path).unlink()

    def test_dump_and_reload(self):
        """Dump a config to YAML and verify it can be loaded back."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(VALID_CONFIG_YAML)
            f.flush()
            path = f.name

        try:
            loader = ConfigLoader(path)
            config = loader.load()

            # Dump to a new file
            dump_path = path + ".dumped"
            loader.dump(config, dump_path)

            # Reload the dumped config
            config2 = load_config(dump_path)
            assert config2.server.name == "test-mcp"
            assert config2.permissions.default_access == AccessLevel.NONE
            assert len(config2.permissions.paths) == 3
        finally:
            Path(path).unlink()
            dump_file = Path(path + ".dumped")
            if dump_file.exists():
                dump_file.unlink()

    def test_env_var_in_config(self, monkeypatch):
        monkeypatch.setenv("LOG_LEVEL", "DEBUG")
        monkeypatch.setenv("SERVER_NAME", "env-test-mcp")

        yaml_content = """
server:
  name: ${SERVER_NAME}
  log_level: ${LOG_LEVEL:-INFO}
  audit_log: /var/log/${SERVER_NAME}/audit.log

permissions:
  default_access: none
  paths: []
  commands: []
  default_command_access: none
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()
            path = f.name

        try:
            config = load_config(path)
            assert config.server.name == "env-test-mcp"
            assert config.server.log_level == "DEBUG"
            assert config.server.audit_log == "/var/log/env-test-mcp/audit.log"
        finally:
            Path(path).unlink()

    def test_convenience_function(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(VALID_CONFIG_YAML)
            f.flush()
            path = f.name

        try:
            config = load_config(path)
            assert isinstance(config, ServerConfig)
            assert config.server.name == "test-mcp"
        finally:
            Path(path).unlink()
