"""Tool: write content to a file on the host filesystem."""

import logging

from permission_engine import PermissionEnforcer

logger = logging.getLogger(__name__)


async def write_file(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    requested = args["path"]
    enforcer.check("write", requested, tool=name)
    try:
        await host.write_file(requested, args["content"])
    except Exception as e:
        logger.error("write_file failed for %s: %s", requested, e)
        return {"error": str(e), "path": requested}
    return {"written": True, "path": requested, "size": len(args["content"])}
