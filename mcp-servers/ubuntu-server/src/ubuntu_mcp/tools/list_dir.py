"""Tool: list directory contents on the host."""

import logging

from permission_engine import PermissionEnforcer

logger = logging.getLogger(__name__)


async def list_dir(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    requested = args["path"]
    enforcer.check("read", requested, tool=name)
    try:
        entries = await host.list_dir(requested)
    except Exception as e:
        logger.warning("list_dir failed for %s: %s", requested, e)
        return {"error": str(e), "path": requested}
    return {"entries": entries, "path": requested, "count": len(entries)}
