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
    """Resolve per-user YAML config, write it to a temp file for the enforcer.

    Security: If ``MCP_USER_ID`` is empty, ``"default"``, or the per-user
    config file does not exist, returns the deny-all template.  This enforces
    the zero-trust-by-default posture.

    Args:
        config_dir: Directory containing per-user YAML config files.
        deny_all_template: Dict used when no valid per-user config is found.

    Returns:
        Tuple of ``(temp_config_file_path, parsed_config_dict)``.
        The temp file is left on disk so the enforcer can read it.
    """
    user_id = os.environ.get("MCP_USER_ID", "")

    if not user_id or user_id == "default":
        config = dict(deny_all_template)
    else:
        user_config = Path(config_dir) / f"{user_id}.yaml"
        if user_config.exists():
            with open(user_config, "r") as f:
                config = yaml.safe_load(f) or dict(deny_all_template)
            logger.info("Loaded per-user config for '%s'", user_id)
        else:
            logger.warning(
                "No config file for user '%s' at %s — using deny-all",
                user_id,
                user_config,
            )
            config = dict(deny_all_template)

    # Write to a temp file so the enforcer can read it as a path
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
