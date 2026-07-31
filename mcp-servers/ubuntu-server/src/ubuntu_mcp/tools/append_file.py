"""Tool: append content to a file on the host."""

from permission_engine import PermissionEnforcer


async def append_file(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    requested = args["path"]
    enforcer.check("write", requested, tool=name)
    try:
        existing = host.read_file(requested)
    except Exception:
        existing = ""
    try:
        await host.write_file(requested, existing + args["content"])
    except Exception as e:
        return {"error": str(e), "path": requested}
    return {"appended": True, "path": requested, "size": len(existing) + len(args["content"])}
