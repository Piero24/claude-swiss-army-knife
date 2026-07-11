"""Tool: list directory contents on the host."""

import os
from pathlib import Path
from datetime import datetime

from permission_engine import PermissionEnforcer


async def list_dir(args: dict, enforcer: PermissionEnforcer, mount_prefix: str) -> dict:
    """List directory contents with metadata.

    Args:
        args: {"path": str, "recursive?": bool}
        enforcer: Permission enforcer.
        mount_prefix: Container mount prefix.

    Returns:
        {"path": str, "entries": [...], "count": int}
    """
    requested = args["path"]
    recursive = args.get("recursive", False)
    enforcer.check("read", requested)

    container_path = (Path(mount_prefix) / requested.lstrip("/")).resolve()

    if not container_path.exists():
        return {"error": f"Directory not found: {requested}", "path": requested}
    if not container_path.is_dir():
        return {"error": f"Not a directory: {requested}", "path": requested}

    entries = []
    try:
        for entry in sorted(container_path.iterdir()):
            stat = entry.stat()
            entries.append({
                "name": entry.name,
                "is_dir": entry.is_dir(),
                "is_symlink": entry.is_symlink(),
                "size": stat.st_size if entry.is_file() else 0,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    except PermissionError:
        return {"error": f"Permission denied listing: {requested}", "path": requested}

    return {
        "path": requested,
        "entries": entries,
        "count": len(entries),
    }
