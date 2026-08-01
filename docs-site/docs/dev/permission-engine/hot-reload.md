---
sidebar_position: 8
---

# Hot Reload

Configuration changes take effect without restarting the MCP server process. This is powered by the `watchfiles` library and the `config_watcher` module.

## How It Works

```
YAML file changed on host (via Web UI or editor)
        │
        │ inotify event
        ▼
watchfiles.awatch() detects change
        │
        │ debounce (avoid duplicate reloads)
        ▼
config_watcher callback triggered
        │
        ▼
enforcer.reload()
  ├── ConfigLoader.load()        # Re-read YAML
  ├── PathResolver.__init__()    # Rebuild rule tree
  └── AuditLogger.__init__()     # Reopen log file
        │
        │ Atomic swap: new objects replace old
        ▼
Next request uses new config (< 1 second total)
```

## config_watcher Implementation

```python
from watchfiles import awatch

async def watch_config(config_path: Path, callback):
    async for changes in awatch(config_path.parent):
        # changes is a set of (change_type, path) tuples
        for change_type, path in changes:
            if Path(path).resolve() == config_path.resolve():
                logger.info("Config changed, reloading...")
                await callback()
                break
```

The watcher monitors the config file's parent directory for modifications. It filters by exact path match and debounces rapid changes (multiple writes from editors).

## BaseMCPServer.reload_config()

```python
class BaseMCPServer:
    async def reload_config(self):
        self.enforcer.reload()
        logger.info("Configuration reloaded successfully")
```

The reload is synchronous and fast (< 100ms). The old config objects are atomically replaced with new ones. Requests in flight when the reload happens complete with the old config.

## Enforcer.reload()

```python
class PermissionEnforcer:
    def reload(self):
        self._config = self._loader.load()
        self._path_resolver = PathResolver(
            rules=self._config.permissions.paths,
            default_access=self._config.permissions.default_access,
        )
        self._audit = AuditLogger(self._config.server.audit_log)
```

The old `PathResolver` and `AuditLogger` instances are garbage collected. Path resolution LRU cache is implicitly cleared (new `PathResolver` instance).

## Why watchfiles?

`watchfiles` was chosen over alternatives:
- **Cross-platform**: Uses inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows
- **Async-native**: `awatch()` integrates with asyncio event loops
- **Reliable**: Handles edge cases like atomic saves and editor temp files
- **Minimal**: Pure Rust core, small dependency footprint
