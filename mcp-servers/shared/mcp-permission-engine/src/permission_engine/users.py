"""User authentication — load users from YAML, validate shared-secret keys.

Key format (v2 with salt):
    sha256$<salt>$<hash>  — 32-char hex salt prepended to plaintext before hashing

Legacy format (v1, still supported):
    sha256$<hash>  —  plaintext hashed directly (no salt)
"""

import hashlib
import hmac
import secrets
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class UserConfig(BaseModel):
    """A single user definition from users.yaml."""

    id: str = Field(..., description="Unique user identifier")
    key: str = Field(
        ...,
        description="Hashed key: 'sha256$<hex>' (legacy) or 'sha256$<salt>$<hex>' (v2)",
    )
    name: str = Field(default="", description="Display name")
    enabled: bool = Field(
        default=True, description="Whether this user is active"
    )
    tools: list[str] = Field(
        default_factory=lambda: ["*"],
        description="Allowed tools: ['*'] = all, or specific tool names",
    )


class UsersConfig(BaseModel):
    """Top-level users configuration."""

    mode: str = Field(
        default="open",
        description="Access mode: 'open', 'allowlist', or 'blocklist'",
    )
    users: list[UserConfig] = Field(
        default_factory=list, description="List of configured users"
    )


class AuthenticationError(Exception):
    """Raised when user credentials are invalid."""


def load_users(path: str) -> UsersConfig:
    """Load users from a YAML file.

    Args:
        path: Path to users.yaml.

    Returns:
        UsersConfig with the loaded users (empty if file doesn't exist).
    """
    p = Path(path)
    if not p.exists():
        return UsersConfig(users=[])
    with open(p, "r") as f:
        data = yaml.safe_load(f) or {}
    return UsersConfig(**data)


def hash_key(plaintext: str, salt: Optional[str] = None) -> str:
    """Hash a plaintext key for storage.

    Uses sha256 with an optional salt. If no salt is provided, a random
    16-byte (32-char hex) salt is generated.

    Args:
        plaintext: The secret key to hash.
        salt: Optional hex salt string. Auto-generated if None.

    Returns:
        Key string in format 'sha256$<salt>$<hash>'.
    """
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.sha256((salt + plaintext).encode()).hexdigest()
    return f"sha256${salt}${digest}"


def validate_user(
    users: UsersConfig, user_id: str, provided_key: str
) -> UserConfig:
    """Validate user credentials against the users config.

    Supports both legacy (sha256$<hash>) and salted (sha256$<salt>$<hash>)
    key formats. Legacy keys are hashed without salt; salted keys prepend
    the salt to the plaintext before hashing.

    Args:
        users: The loaded UsersConfig.
        user_id: The user ID to validate.
        provided_key: The plaintext key provided by the client.

    Returns:
        UserConfig if credentials are valid.

    Raises:
        AuthenticationError: If the user is unknown, disabled, or key is invalid.
    """
    if not user_id or user_id == "default":
        raise AuthenticationError("No user identity provided")

    for user in users.users:
        if user.id == user_id:
            if not user.enabled:
                raise AuthenticationError(f"User '{user_id}' is disabled")

            # Parse stored key
            if "$" not in user.key:
                raise AuthenticationError(
                    f"Invalid key format for user '{user_id}'"
                )

            parts = user.key.split("$")
            algo = parts[0]

            if len(parts) == 2:
                # Legacy format: sha256$<hex> — no salt
                salt = ""
                stored_hash = parts[1]
            elif len(parts) == 3:
                # V2 format: sha256$<salt>$<hex>
                salt = parts[1]
                stored_hash = parts[2]
            else:
                raise AuthenticationError(
                    f"Invalid key format for user '{user_id}'"
                )

            if algo == "sha256":
                computed = hashlib.sha256(
                    (salt + provided_key).encode()
                ).hexdigest()
                if hmac.compare_digest(computed, stored_hash):
                    return user

            raise AuthenticationError(f"Invalid key for user '{user_id}'")

    raise AuthenticationError(f"Unknown user '{user_id}'")
