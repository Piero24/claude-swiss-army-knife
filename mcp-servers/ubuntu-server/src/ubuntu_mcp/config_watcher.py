"""Hot-reload support: watches the config file for changes."""

import asyncio
import logging
from pathlib import Path
from typing import Callable

from watchfiles import awatch

logger = logging.getLogger(__name__)


async def watch_config(
    config_path: str | Path, reload_callback: Callable[[], None]
) -> None:
    """Watch a config file for changes and call reload_callback on modification.

    Uses watchfiles for efficient file system monitoring.
    Runs as a background task — never returns unless cancelled.

    Args:
        config_path: Path to the YAML config file to watch.
        reload_callback: Function to call when the config changes.
    """
    config_path = Path(config_path).resolve()
    logger.info("Watching config file for changes: %s", config_path)

    async for changes in awatch(config_path):
        change_types = {ct for _, ct in changes}
        logger.info("Config file change detected: %s — reloading", change_types)
        try:
            reload_callback()
            logger.info("Config reloaded successfully")
        except Exception:
            logger.exception("Failed to reload config after file change")
