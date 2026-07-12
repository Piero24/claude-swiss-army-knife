"""Tool: execute a shell command with allowlist enforcement."""

import asyncio
import shlex

from permission_engine import ForbiddenError, PermissionEnforcer


async def execute(
    args: dict, enforcer: PermissionEnforcer, name: str = ""
) -> dict:
    """Execute a shell command on the host.

    Args:
        args: {"command": str, "timeout?": int}
        enforcer: Permission enforcer.

    Returns:
        {"stdout": str, "stderr": str, "exit_code": int}
    """
    command = args["command"]
    timeout = args.get("timeout", 30)

    # Validate against command allowlist
    enforcer.check_command(command, tool=name)

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        return {
            "error": f"Command timed out after {timeout}s",
            "command": command,
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
        }

    return {
        "stdout": stdout.decode("utf-8", errors="replace"),
        "stderr": stderr.decode("utf-8", errors="replace"),
        "exit_code": process.returncode,
        "command": command,
    }
