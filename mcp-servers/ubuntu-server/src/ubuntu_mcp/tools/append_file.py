"""Tool: append content to a file on the host."""

from pathlib import Path

from permission_engine import PermissionEnforcer


async def append_file(
    args: dict, enforcer: PermissionEnforcer, mount_prefix: str, name: str = ""
) -> dict:
    """Append lines to a file on the host filesystem.

    Args:
        args: {"path": str, "content": str}
        enforcer: Permission enforcer instance.
        mount_prefix: Container mount prefix.

    Returns:
        {"appended": bool, "path": str, "bytes": int}
    """
    requested = args["path"]
    content = args["content"]
    enforcer.check("write", requested, tool=name)

    container_path = (Path(mount_prefix) / requested.lstrip("/")).resolve()

    container_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(container_path, "a") as f:
            f.write(content)
    except PermissionError:
        return {
            "error": f"Permission denied appending to: {requested}",
            "path": requested,
        }

    return {
        "appended": True,
        "path": requested,
        "bytes": len(content.encode("utf-8")),
    }
