---
sidebar_position: 5
---

# Config Watcher

The `config_watcher` module provides hot-reload for configuration files using the `watchfiles` library.

## Standard Implementation

```python
# config_watcher.py
import logging
from pathlib import Path
from watchfiles import awatch

logger = logging.getLogger(__name__)

async def watch_config(config_path: Path, callback):
    """Watch a config file for changes and invoke callback on modification."""
    async for changes in awatch(config_path.parent):
        for change_type, path in changes:
            if Path(path).resolve() == config_path.resolve():
                logger.info("Config file changed, triggering reload")
                await callback()
                break
```

## Usage in Main Entry Point

```python
async def main():
    config_path = Path(args.config).resolve()
    app = MyServer(str(config_path))

    # Start watcher as a background task
    watch_task = asyncio.create_task(
        watch_config(config_path, app.reload_config)
    )

    # Run the MCP server
    async with stdio_server() as (read_stream, write_stream):
        await app.server.run(read_stream, write_stream, ...)

    # Cleanup on shutdown
    watch_task.cancel()
    try:
        await watch_task
    except asyncio.CancelledError:
        pass
```

## Design Notes

- **Parent directory watching**: `watchfiles` monitors the parent directory for atomic save detection (editors often write to a temp file then rename)
- **Exact path matching**: Only triggers on the specific config file, not other files in the same directory
- **Debouncing**: `watchfiles` handles rapid consecutive changes (e.g., multiple writes during a save)
- **Async**: Uses `awatch()` for non-blocking integration with the asyncio event loop
- **Cancellation**: The watcher task is cancelled on server shutdown for clean exit
