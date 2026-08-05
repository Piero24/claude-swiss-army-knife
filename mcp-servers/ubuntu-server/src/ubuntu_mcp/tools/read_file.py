"""Tool: read a file from the host filesystem."""

import logging

from permission_engine import ForbiddenError, PermissionEnforcer

logger = logging.getLogger(__name__)


async def read_file(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    """Read a file from the host filesystem."""
    requested = args["path"]
    enforcer.check("read", requested, tool=name)

    try:
        content = host.read_file(requested)
    except FileNotFoundError:
        logger.warning("File not found: %s", requested)
        return {"error": f"File not found: {requested}", "path": requested}
    except PermissionError:
        logger.warning("Permission denied reading: %s", requested)
        return {
            "error": f"Permission denied reading: {requested}",
            "path": requested,
        }
    except Exception as e:
        logger.error("Cannot read file %s: %s", requested, e)
        return {"error": f"Cannot read file: {e}", "path": requested}

    return {"content": content, "path": requested, "size": len(content)}
