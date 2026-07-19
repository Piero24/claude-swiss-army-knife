"""Tests for user authentication."""

import hashlib
import tempfile
from pathlib import Path

import pytest
import yaml
from permission_engine.users import (
    AuthenticationError,
    UserConfig,
    UsersConfig,
    load_users,
    validate_user,
)


def _hash_key(plaintext: str) -> str:
    """Helper to hash a key for test configs (salted format)."""
    import secrets

    salt = secrets.token_hex(16)
    return (
        "sha256$"
        + salt
        + "$"
        + hashlib.sha256((salt + plaintext).encode()).hexdigest()
    )


def _write_users_yaml(users: list[dict], dir_path: str) -> str:
    """Write a temporary users.yaml and return its path."""
    path = str(Path(dir_path) / "users.yaml")
    with open(path, "w") as f:
        yaml.safe_dump({"users": users}, f)
    return path


class TestUserConfig:
    """Tests for the UserConfig model."""

    def test_valid_user(self):
        user = UserConfig(id="alice", key="sha256$abc123", name="Alice")
        assert user.id == "alice"
        assert user.enabled is True
        assert user.name == "Alice"

    def test_user_defaults(self):
        user = UserConfig(id="bob", key="sha256$def456")
        assert user.name == ""
        assert user.enabled is True


class TestLoadUsers:
    """Tests for load_users()."""

    def test_load_valid_users(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_users_yaml(
                [
                    {
                        "id": "alice",
                        "key": _hash_key("secret1"),
                        "name": "Alice",
                    },
                    {
                        "id": "bob",
                        "key": _hash_key("secret2"),
                        "name": "Bob",
                        "enabled": False,
                    },
                ],
                tmpdir,
            )
            users = load_users(path)
            assert len(users.users) == 2
            assert users.users[0].id == "alice"
            assert users.users[1].enabled is False

    def test_load_empty_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "users.yaml")
            with open(path, "w") as f:
                f.write("")
            users = load_users(path)
            assert users.users == []

    def test_load_nonexistent_file(self):
        users = load_users("/nonexistent/path/users.yaml")
        assert users.users == []


class TestValidateUser:
    """Tests for validate_user()."""

    @pytest.fixture
    def users_config(self):
        return UsersConfig(
            users=[
                UserConfig(
                    id="alice",
                    key=_hash_key("alice-secret"),
                    name="Alice",
                    enabled=True,
                ),
                UserConfig(
                    id="bob",
                    key=_hash_key("bob-secret"),
                    name="Bob",
                    enabled=False,
                ),
                UserConfig(
                    id="carol",
                    key="badformat",  # missing "sha256$" prefix
                    name="Carol",
                    enabled=True,
                ),
            ]
        )

    def test_valid_credentials(self, users_config):
        user = validate_user(users_config, "alice", "alice-secret")
        assert user.id == "alice"

    def test_invalid_key(self, users_config):
        with pytest.raises(AuthenticationError, match="Invalid key"):
            validate_user(users_config, "alice", "wrong-secret")

    def test_disabled_user(self, users_config):
        with pytest.raises(AuthenticationError, match="disabled"):
            validate_user(users_config, "bob", "bob-secret")

    def test_unknown_user(self, users_config):
        with pytest.raises(AuthenticationError, match="Unknown user"):
            validate_user(users_config, "dave", "whatever")

    def test_default_user_id_rejected(self, users_config):
        with pytest.raises(AuthenticationError, match="No user identity"):
            validate_user(users_config, "default", "")

    def test_empty_user_id_rejected(self, users_config):
        with pytest.raises(AuthenticationError, match="No user identity"):
            validate_user(users_config, "", "")

    def test_bad_key_format_no_dollar(self, users_config):
        with pytest.raises(AuthenticationError, match="Invalid key format"):
            validate_user(users_config, "carol", "whatever")

    def test_bad_key_format_legacy_two_part(self):
        """Legacy 'sha256$<hash>' format without salt should be rejected."""
        config = UsersConfig(
            users=[
                UserConfig(
                    id="dave",
                    key="sha256$abc123",
                    name="Dave",
                    enabled=True,
                )
            ]
        )
        with pytest.raises(AuthenticationError, match="Invalid key format"):
            validate_user(config, "dave", "whatever")

    def test_constant_time_comparison(self, users_config):
        """hmac.compare_digest should not leak timing info."""
        # This test verifies the function doesn't crash with various inputs
        with pytest.raises(AuthenticationError):
            validate_user(users_config, "alice", "")
        with pytest.raises(AuthenticationError):
            validate_user(users_config, "alice", "a" * 100)


class TestAccessControlFields:
    """Tests for mode and tools fields in user/access configs."""

    def test_users_config_default_mode(self):
        config = UsersConfig(users=[])
        assert config.mode == "open"

    def test_users_config_custom_mode(self):
        config = UsersConfig(mode="allowlist", users=[])
        assert config.mode == "allowlist"

    def test_user_config_default_tools(self):
        user = UserConfig(id="alice", key="sha256$abc123")
        assert user.tools == ["*"]

    def test_user_config_custom_tools(self):
        user = UserConfig(
            id="alice",
            key="sha256$abc123",
            tools=["ubuntu_read_file", "ubuntu_list_dir"],
        )
        assert "ubuntu_read_file" in user.tools
        assert len(user.tools) == 2
