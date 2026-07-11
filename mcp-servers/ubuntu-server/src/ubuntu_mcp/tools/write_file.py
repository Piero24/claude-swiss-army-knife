"""Tool: write a file to the host filesystem."""

from pathlib import Path

from permission_engine import ForbiddenError, PermissionEnforcer


async def write_file(args: dict, enforcer: PermissionEnforcer, mount_prefix: str) -> dict:
    """Write (overwrite) a file on the host filesystem.

    Args:
        args: {"path": str, "content": str}
        enforcer: Permission enforcer instance.
        mount_prefix: Container mount prefix.

    Returns:
        {"written": bool, "path": str, "bytes": int}
    """
    requested = args["path"]
    content = args["content"]
    enforcer.check("write", requested)

    container_path = (Path(mount_prefix) / requested.lstrip("/")).resolve()

    # Ensure parent directory exists
    container_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        container_path.write_text(content, encoding="utf-8")
    except PermissionError:
        return {"error": f"Permission denied writing: {requested}", "path": requested}

    return {
        "written": True,
        "path": requested,
        "bytes": len(content.encode("utf-8")),
    }
