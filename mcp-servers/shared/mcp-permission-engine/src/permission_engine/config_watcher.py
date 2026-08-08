"""Hot-reload support: watches config files for changes.

Uses ``watchfiles`` for efficient filesystem monitoring.  Runs as a background
``asyncio`` task — never returns unless cancelled.

Previously duplicated in ubuntu-mcp, obsidian-mcp, and synology-mcp.
"""

import logging
from pathlib import Path
from typing import Callable

from watchfiles import awatch

logger = logging.getLogger(__name__)


async def watch_config(
    config_path: str | Path, reload_callback: Callable[[], None]
) -> None:
    """Watch a config file or directory for changes and invoke *reload_callback*.

    Args:
        config_path: Path to the YAML config file (or directory) to watch.
        reload_callback: Synchronous function called when a change is detected.
    """
    config_path = Path(config_path).resolve()
    logger.info("Watching config for changes: %s", config_path)

    async for changes in awatch(config_path):
        change_types = {ct for _, ct in changes}
        logger.info("Config change detected: %s — reloading", change_types)
        try:
            reload_callback()
            logger.info("Config reloaded successfully")
        except Exception:
            logger.exception("Failed to reload config after file change")
