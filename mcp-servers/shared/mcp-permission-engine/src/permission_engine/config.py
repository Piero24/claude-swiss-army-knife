"""YAML config loader with Pydantic schema validation and env var substitution."""

import os
import re
from pathlib import Path
from typing import Optional

import yaml
from pydantic import ValidationError

from .models import ServerConfig


# Matches ${VAR_NAME} and ${VAR_NAME:-default_value}
_ENV_VAR_PATTERN = re.compile(r"\$\{(\w+)(?::-([^}]+))?\}")


def _resolve_env_vars(value: str) -> str:
    """Replace ${VAR} and ${VAR:-default} patterns in a string."""

    def _replacer(match: re.Match) -> str:
        var_name = match.group(1)
        default = match.group(2)
        return os.environ.get(var_name, default if default is not None else "")

    return _ENV_VAR_PATTERN.sub(_replacer, value)


def _resolve_env_vars_in_obj(obj: object) -> object:
    """Recursively resolve env vars in strings within dicts, lists, and scalars."""
    if isinstance(obj, str):
        return _resolve_env_vars(obj)
    elif isinstance(obj, dict):
        return {k: _resolve_env_vars_in_obj(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_resolve_env_vars_in_obj(item) for item in obj]
    return obj


class ConfigLoader:
    """Loads and validates a YAML config file with env var substitution."""

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = Path(config_path) if config_path else None

    def load(self, path: Optional[str] = None) -> ServerConfig:
        """Load a YAML config file, resolve env vars, and validate against the schema.

        Args:
            path: Path to YAML config file. Uses self.config_path if not provided.

        Returns:
            Validated ServerConfig object.

        Raises:
            FileNotFoundError: If the config file doesn't exist.
            ValidationError: If the config doesn't match the expected schema.
        """
        config_path = Path(path) if path else self.config_path
        if config_path is None:
            raise ValueError("No config path provided")

        config_path = config_path.resolve()

        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")

        with open(config_path, "r") as f:
            raw = yaml.safe_load(f)

        if raw is None:
            raise ValueError(f"Config file is empty: {config_path}")

        # Resolve env vars in all string values
        resolved = _resolve_env_vars_in_obj(raw)

        try:
            return ServerConfig.model_validate(resolved)
        except ValidationError:
            raise

    def dump(self, config: ServerConfig, path: Optional[str] = None) -> None:
        """Serialize a ServerConfig back to YAML and write to disk.

        Args:
            config: The validated ServerConfig to write.
            path: Output path. Uses self.config_path if not provided.
        """
        output_path = Path(path) if path else self.config_path
        if output_path is None:
            raise ValueError("No output path provided")

        # Convert to dict, using JSON-compatible types (enums → strings)
        data = config.model_dump(mode="json", exclude_none=False)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w") as f:
            yaml.safe_dump(
                data,
                f,
                default_flow_style=False,
                sort_keys=False,
                allow_unicode=True,
            )


def load_config(path: str) -> ServerConfig:
    """Convenience function to load a config from a path."""
    return ConfigLoader(path).load()
