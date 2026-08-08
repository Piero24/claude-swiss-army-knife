"""Centralised scan exclusion patterns for folder discovery.

Loaded from ``settings.json`` (key ``scan.excludePatterns``).
Supports both exact names and wildcard patterns (e.g. ``*.app``).

Previously duplicated in ubuntu, obsidian, and synology discover modules.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def load_excludes(configs_dir: str | None = None) -> set[str]:
    """Load exclude patterns from ``settings.json``.

    Args:
        configs_dir: Override for the configs directory.
            Defaults to ``CONFIGS_PATH`` env var or ``/app/configs``.

    Returns:
        Set of pattern strings (may be empty).
    """
    if configs_dir is None:
        configs_dir = os.environ.get("CONFIGS_PATH", "/app/configs")

    settings_file = Path(configs_dir) / "settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, "r") as f:
                data = json.load(f)
                patterns = data.get("scan", {}).get("excludePatterns", [])
                if isinstance(patterns, list):
                    return set(patterns)
        except Exception:
            logger.warning(
                "Failed to load exclude patterns from %s", settings_file
            )
    return set()


def is_excluded(name: str, excludes: set[str]) -> bool:
    """Check if a folder name matches any exclusion pattern.

    Supports:
    - Exact name match (e.g. ``".git"``)
    - Suffix wildcard (e.g. ``"*.app"`` matches ``"MyApp.app"``)

    Args:
        name: Folder basename to check.
        excludes: Set of patterns from :func:`load_excludes`.
    """
    if name in excludes:
        return True
    for pat in excludes:
        if pat.startswith("*.") and name.endswith(pat[1:]):
            return True
    return False
