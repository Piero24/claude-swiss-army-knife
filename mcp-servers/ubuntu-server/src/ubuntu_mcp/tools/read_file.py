"""Tool: read a file from the host filesystem."""

from permission_engine import ForbiddenError, PermissionEnforcer


async def read_file(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    """Read a file from the host filesystem."""
    requested = args["path"]
    enforcer.check("read", requested, tool=name)

    try:
        content = host.read_file(requested)
    except FileNotFoundError:
        return {"error": f"File not found: {requested}", "path": requested}
    except PermissionError:
        return {
            "error": f"Permission denied reading: {requested}",
            "path": requested,
        }
    except Exception as e:
        return {"error": f"Cannot read file: {e}", "path": requested}

    return {"content": content, "path": requested, "size": len(content)}
