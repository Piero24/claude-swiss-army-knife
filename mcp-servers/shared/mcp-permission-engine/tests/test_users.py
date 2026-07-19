"""Tests for user authentication."""

import hashlib
import secrets
import tempfile
from pathlib import Path

import pytest
import yaml
from permission_engine.users import (
    AuthenticationError,
    UserConfig,
    UsersConfig,
    hash_key,
    load_users,
    validate_user,
)


def _hash_key_legacy(plaintext: str) -> str:
    """Helper to create a legacy (unsalted) key hash for test configs."""
    return "sha256$" + hashlib.sha256(plaintext.encode()).hexdigest()


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
                        "key": _hash_key_legacy("secret1"),
                        "name": "Alice",
                    },
                    {
                        "id": "bob",
                        "key": _hash_key_legacy("secret2"),
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
                    key=_hash_key_legacy("alice-secret"),
                    name="Alice",
                    enabled=True,
                ),
                UserConfig(
                    id="bob",
                    key=_hash_key_legacy("bob-secret"),
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

    def test_bad_key_format(self, users_config):
        with pytest.raises(AuthenticationError, match="Invalid key format"):
            validate_user(users_config, "carol", "whatever")

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


class TestSaltedKeys:
    """Tests for salted key hashing (v2 format: sha256$<salt>$<hash>)."""

    def test_hash_key_generates_salt(self):
        """hash_key() without salt should auto-generate one."""
        result = hash_key("my-secret")
        parts = result.split("$")
        assert len(parts) == 3
        assert parts[0] == "sha256"
        assert len(parts[1]) == 32  # 16-byte hex salt
        assert len(parts[2]) == 64  # sha256 hex digest

    def test_hash_key_with_explicit_salt(self):
        """hash_key() with explicit salt should be deterministic."""
        salt = "a" * 32
        result1 = hash_key("secret", salt=salt)
        result2 = hash_key("secret", salt=salt)
        assert result1 == result2
        assert salt in result1

    def test_salted_key_validation(self):
        """validate_user() should accept salted keys."""
        key = hash_key("my-secret")
        config = UsersConfig(
            users=[UserConfig(id="alice", key=key, enabled=True)]
        )
        user = validate_user(config, "alice", "my-secret")
        assert user.id == "alice"

    def test_salted_key_wrong_password(self):
        """Salted key should reject wrong password."""
        key = hash_key("correct-secret")
        config = UsersConfig(
            users=[UserConfig(id="alice", key=key, enabled=True)]
        )
        with pytest.raises(AuthenticationError, match="Invalid key"):
            validate_user(config, "alice", "wrong-secret")

    def test_legacy_key_still_works(self):
        """Legacy sha256$<hex> keys (no salt) should still validate."""
        legacy_key = _hash_key_legacy("old-secret")
        config = UsersConfig(
            users=[UserConfig(id="bob", key=legacy_key, enabled=True)]
        )
        user = validate_user(config, "bob", "old-secret")
        assert user.id == "bob"

    def test_mixed_salted_and_legacy_users(self):
        """A config can mix salted and legacy keys."""
        salted = hash_key("new-secret")
        legacy = _hash_key_legacy("old-secret")
        config = UsersConfig(
            users=[
                UserConfig(id="new-user", key=salted, enabled=True),
                UserConfig(id="old-user", key=legacy, enabled=True),
            ]
        )
        assert validate_user(config, "new-user", "new-secret").id == "new-user"
        assert validate_user(config, "old-user", "old-secret").id == "old-user"
