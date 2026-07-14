"""User authentication — load users from YAML, validate shared-secret keys."""

import hashlib
import hmac
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class UserConfig(BaseModel):
    """A single user definition from users.yaml."""

    id: str = Field(..., description="Unique user identifier")
    key: str = Field(..., description="Hashed key in format 'sha256$<hex>'")
    name: str = Field(default="", description="Display name")
    enabled: bool = Field(
        default=True, description="Whether this user is active"
    )


class UsersConfig(BaseModel):
    """Top-level users configuration."""

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


def validate_user(
    users: UsersConfig, user_id: str, provided_key: str
) -> UserConfig:
    """Validate user credentials against the users config.

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

            # Parse stored key: "sha256$<hex>"
            if "$" in user.key:
                algo, stored_hash = user.key.split("$", 1)
            else:
                raise AuthenticationError(
                    f"Invalid key format for user '{user_id}'"
                )

            if algo == "sha256":
                computed = hashlib.sha256(provided_key.encode()).hexdigest()
                if hmac.compare_digest(computed, stored_hash):
                    return user

            raise AuthenticationError(f"Invalid key for user '{user_id}'")

    raise AuthenticationError(f"Unknown user '{user_id}'")
