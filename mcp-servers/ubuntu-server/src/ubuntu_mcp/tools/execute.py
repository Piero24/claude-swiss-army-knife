"""Tool: execute a shell command with allowlist enforcement."""

from permission_engine import PermissionEnforcer


async def execute(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    command = args["command"]
    timeout = args.get("timeout", 30)
    enforcer.check_command(command, tool=name)
    result = await host.run_command(command, timeout=timeout)
    return {
        "stdout": result["stdout"],
        "stderr": result["stderr"],
        "exit_code": result["exit_code"],
        "command": command,
    }
