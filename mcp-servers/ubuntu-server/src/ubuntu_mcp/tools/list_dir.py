"""Tool: list directory contents on the host."""

from permission_engine import PermissionEnforcer


async def list_dir(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    requested = args["path"]
    enforcer.check("read", requested, tool=name)
    try:
        entries = await host.list_dir(requested)
    except Exception as e:
        return {"error": str(e), "path": requested}
    return {"entries": entries, "path": requested, "count": len(entries)}
