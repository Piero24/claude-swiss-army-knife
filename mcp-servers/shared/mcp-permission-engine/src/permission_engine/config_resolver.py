"""Per-user config resolution with deny-all fallback.

Centralizes the security-critical zero-trust behaviour: if no per-user config
exists, or if the user ID is empty / "default", a deny-all template is returned.

Every MCP server previously had its own copy of this logic.
"""

import logging
import os
import tempfile
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


def resolve_user_config(
    config_dir: str,
    deny_all_template: dict,
) -> tuple[str, dict]:
    """Resolve per-user YAML config and return the config file path.

    Returns the **original** file path when a per-user config exists so that
    :meth:`PermissionEnforcer.reload` picks up changes made via the Web UI.
    A temp file is only created as a last resort when no config is found.

    Resolution order:
    1. ``MCP_USER_ID`` env var (stdio mode)
    2. Auto-detect: single ``*.yaml`` file in *config_dir* (SSE mode)
    3. Deny-all temp file (fallback — should not happen in practice)

    Args:
        config_dir: Directory containing per-user YAML config files.
        deny_all_template: Dict used when no valid per-user config is found.

    Returns:
        Tuple of ``(config_file_path, parsed_config_dict)``.
    """
    config_dir_path = Path(config_dir)
    user_config: Path | None = None

    # 1. Try env var (stdio mode)
    user_id = os.environ.get("MCP_USER_ID", "")
    if user_id and user_id != "default":
        candidate = config_dir_path / f"{user_id}.yaml"
        if candidate.exists():
            user_config = candidate

    # 2. Auto-detect: any single *.yaml file (SSE mode — no env var)
    if not user_config:
        yaml_files = sorted(
            f
            for f in config_dir_path.glob("*.yaml")
            if not f.name.startswith(".")
        )
        if len(yaml_files) == 1:
            user_config = yaml_files[0]
            logger.info("Auto-detected per-user config: %s", user_config.name)

    # 3. Load and return original path (so reload() sees Web UI changes)
    if user_config and user_config.exists():
        with open(user_config, "r") as f:
            config = yaml.safe_load(f) or dict(deny_all_template)
        logger.info("Loaded per-user config from '%s'", user_config)
        return str(user_config), config

    # Last resort: deny-all temp file (should not happen in practice)
    logger.warning("No per-user config in %s — using deny-all", config_dir)
    config = dict(deny_all_template)
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False)
    yaml.dump(config, tmp)
    tmp.flush()
    return tmp.name, config


def create_deny_all(server_name: str) -> dict:
    """Create a minimal deny-all config template for a given server.

    This is the standard zero-trust default — no paths, no commands,
    no tools are permitted.
    """
    return {
        "server": {
            "name": server_name,
            "log_level": "INFO",
            "audit_log": "/var/log/mcp/audit.log",
        },
        "permissions": {
            "default_access": "none",
            "paths": [],
            "commands": [],
            "default_command_access": "none",
            "tools": [],
            "default_tool_access": "none",
        },
    }
