"""Tool: read a file from the host filesystem."""

from pathlib import Path

from permission_engine import ForbiddenError, PermissionEnforcer


async def read_file(args: dict, enforcer: PermissionEnforcer, mount_prefix: str) -> dict:
    """Read a file from the host filesystem.

    Args:
        args: {"path": str}
        enforcer: Permission enforcer instance.
        mount_prefix: Container mount prefix (e.g., "/mnt/host").

    Returns:
        {"content": str, "path": str, "size": int}
    """
    requested = args["path"]
    enforcer.check("read", requested)

    container_path = (Path(mount_prefix) / requested.lstrip("/")).resolve()

    if not container_path.exists():
        return {"error": f"File not found: {requested}", "path": requested}

    if not container_path.is_file():
        return {"error": f"Not a file: {requested}", "path": requested}

    try:
        content = container_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # Try reading as latin-1 for binary-ish files
        try:
            content = container_path.read_text(encoding="latin-1")
        except Exception:
            return {"error": f"Cannot read file as text: {requested}", "path": requested}
    except PermissionError:
        return {"error": f"Permission denied reading: {requested}", "path": requested}

    return {
        "content": content,
        "path": requested,
        "size": len(content),
    }
