"""Tool: delete a file from the host filesystem."""

import logging

from permission_engine import PermissionEnforcer

logger = logging.getLogger(__name__)


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
        logger.warning("File not found for deletion: %s", requested)
        return {"error": f"File not found: {requested}", "path": requested}
    except PermissionError:
        logger.warning("Permission denied deleting: %s", requested)
        return {
            "error": f"Permission denied deleting: {requested}",
            "path": requested,
        }
    except Exception as e:
        logger.error("Cannot delete file %s: %s", requested, e)
        return {"error": f"Cannot delete file: {e}", "path": requested}

    return {"deleted": True, "path": requested}
