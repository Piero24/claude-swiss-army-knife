---
sidebar_position: 4
---

# Path Mapper

The `PathMapper` class translates between host filesystem paths and container mount paths.

## Why Path Mapping Is Needed

The Ubuntu MCP container mounts host directories under `/mnt/host/`:

```
Host: /var/log/nginx/access.log
Container: /mnt/host/var/log/nginx/access.log
```

Permission rules reference host paths (what the user sees), but file operations need container paths (what the filesystem has). The `PathMapper` bridges this gap.

## Implementation

```python
class PathMapper:
    def __init__(self, mount_prefix: str = "/mnt/host"):
        self._mount_prefix = mount_prefix

    def host_to_container(self, host_path: str) -> Path:
        clean = host_path.lstrip("/")
        return (Path(self._mount_prefix) / clean).resolve(strict=False)

    def container_to_host(self, container_path: str) -> str:
        return "/" + str(Path(container_path).relative_to(self._mount_prefix))
```

## Usage in Tools

```python
# In a tool handler:
mapper = PathMapper("/mnt/host")
container_path = mapper.host_to_container("/var/log/nginx/access.log")
# container_path = /mnt/host/var/log/nginx/access.log

content = container_path.read_text()
```

## safe_resolve_path Integration

The `PathMapper` is used alongside `PermissionEnforcer.safe_resolve_path()`:

```python
# 1. Permission check uses host path
enforcer.check("read", "/var/log/nginx/access.log", tool_name)

# 2. safe_resolve_path maps and validates
resolved = enforcer.safe_resolve_path(
    "/var/log/nginx/access.log",
    "/mnt/host",
    allowed_bases=["/var/log", "/var/www"]
)
# resolved = /mnt/host/var/log/nginx/access.log

# 3. File operation uses resolved container path
content = resolved.read_text()
```

This two-step approach ensures:
1. Permission rules reference intuitive host paths
2. Path traversal is blocked (cannot escape allowed bases)
3. File operations use correct container paths
