"""Hot-reload support: watches the config file for changes."""

import logging
from pathlib import Path
from typing import Callable

from watchfiles import awatch

logger = logging.getLogger(__name__)


async def watch_config(config_path: str | Path, reload_callback: Callable[[], None]) -> None:
    config_path = Path(config_path).resolve()
    logger.info("Watching config: %s", config_path)
    async for changes in awatch(config_path):
        logger.info("Config changed — reloading")
        try:
            reload_callback()
        except Exception:
            logger.exception("Failed to reload config")
