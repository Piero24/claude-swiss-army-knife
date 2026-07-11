"""Tool: manage systemd services on the host via nsenter."""

import asyncio

from permission_engine import PermissionEnforcer


async def _run_nsenter(command: str, timeout: int = 15) -> dict:
    """Run a command via nsenter to reach the host's systemd."""
    nsenter_cmd = f"nsenter --mount=/proc/1/ns/mnt -- {command}"
    try:
        process = await asyncio.create_subprocess_shell(
            nsenter_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
        return {
            "stdout": stdout.decode("utf-8", errors="replace"),
            "stderr": stderr.decode("utf-8", errors="replace"),
            "exit_code": process.returncode,
        }
    except asyncio.TimeoutError:
        return {
            "error": f"Command timed out after {timeout}s",
            "stdout": "",
            "stderr": "",
        }


async def service_status(args: dict, enforcer: PermissionEnforcer) -> dict:
    """Check the status of a systemd service.

    Args:
        args: {"service": str}
        enforcer: Permission enforcer.

    Returns:
        {service, status}
    """
    service = args["service"]
    enforcer.check_command(f"systemctl status {service}")
    result = await _run_nsenter(
        f"systemctl is-active {service} && systemctl is-enabled {service} || true"
    )
    lines = result["stdout"].strip().split("\n")
    return {
        "service": service,
        "active": lines[0].strip() if len(lines) > 0 else "unknown",
        "enabled": lines[1].strip() if len(lines) > 1 else "unknown",
    }


async def service_manage(args: dict, enforcer: PermissionEnforcer) -> dict:
    """Start, stop, restart, or reload a systemd service.

    Args:
        args: {"service": str, "action": "start"|"stop"|"restart"|"reload"}
        enforcer: Permission enforcer.

    Returns:
        {service, action, result}
    """
    service = args["service"]
    action = args["action"]
    valid_actions = {"start", "stop", "restart", "reload"}
    if action not in valid_actions:
        return {
            "error": f"Invalid action: {action}. Must be one of {valid_actions}"
        }

    enforcer.check_command(f"systemctl {action} {service}")
    result = await _run_nsenter(f"systemctl {action} {service}")
    return {
        "service": service,
        "action": action,
        "result": "success" if result.get("exit_code") == 0 else "failed",
        "output": result["stdout"].strip() or result["stderr"].strip(),
    }
