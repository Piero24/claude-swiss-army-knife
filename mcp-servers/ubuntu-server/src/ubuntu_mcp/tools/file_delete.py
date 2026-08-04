"""Tool: delete a file from the host filesystem."""

from permission_engine import PermissionEnforcer


async def file_delete(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    """Delete a file from the host filesystem."""
    requested = args["path"]

    # Require 'write' access on the target path to delete it
    enforcer.check("write", requested, tool=name)

    try:
        await host.delete_file(requested)
    except FileNotFoundError:
        return {"error": f"File not found: {requested}", "path": requested}
    except PermissionError:
        return {
            "error": f"Permission denied deleting: {requested}",
            "path": requested,
        }
    except Exception as e:
        return {"error": f"Cannot delete file: {e}", "path": requested}

    return {"deleted": True, "path": requested}
