"""Gateway configuration — constants, environment, and logger."""

import logging
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Container target resolution — maps external server names to internal URLs
# ---------------------------------------------------------------------------
CONTAINER_TARGETS: dict[str, list[str]] = {
    "ubuntu-server": [
        "http://ubuntu-mcp:8000",
        "http://ubuntu-server:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "ubuntu-mcp": [
        "http://ubuntu-mcp:8000",
        "http://ubuntu-server:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "obsidian": [
        "http://obsidian-mcp:8000",
        "http://obsidian:8000",
    ],
    "obsidian-mcp": [
        "http://obsidian-mcp:8000",
        "http://obsidian:8000",
    ],
    "synology-nas": [
        "http://synology-mcp:8000",
        "http://synology-nas:8000",
    ],
    "synology-mcp": [
        "http://synology-mcp:8000",
        "http://synology-nas:8000",
    ],
    "github": [
        "http://github-mcp:8000",
        "http://github:8000",
    ],
    "github-mcp": [
        "http://github-mcp:8000",
        "http://github:8000",
    ],
    "link-manager": [
        "http://link-manager-mcp:8000",
        "http://link-manager:8000",
    ],
    "link-manager-mcp": [
        "http://link-manager-mcp:8000",
        "http://link-manager:8000",
    ],
}

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp-gateway")

# ---------------------------------------------------------------------------
# Paths & feature flags
# ---------------------------------------------------------------------------
CONFIGS_DIR = Path(os.environ.get("CONFIGS_PATH", "/app/configs"))
USERS_FILE = CONFIGS_DIR / "users.yaml"
SECURITY_WEBHOOK_URL = os.environ.get("SECURITY_WEBHOOK_URL", "")
