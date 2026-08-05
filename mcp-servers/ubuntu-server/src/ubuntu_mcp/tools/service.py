"""Tool: manage systemd services on the host."""

import logging

from permission_engine import PermissionEnforcer

logger = logging.getLogger(__name__)


async def service_status(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    service = args["service"]
    enforcer.check_command(f"systemctl status {service}", tool=name)
    cmd = f"systemctl is-active {service} && systemctl is-enabled {service} || true"
    result = await host.run_command(cmd)
    if result.get("error"):
        logger.warning(
            "service_status failed for %s: %s", service, result.get("error")
        )
    lines = result["stdout"].strip().split("\n")
    return {
        "service": service,
        "active": lines[0].strip() if len(lines) > 0 else "unknown",
        "enabled": lines[1].strip() if len(lines) > 1 else "unknown",
    }


async def service_manage(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    service = args["service"]
    action = args["action"]
    valid_actions = {"start", "stop", "restart", "reload"}
    if action not in valid_actions:
        logger.warning(
            "service_manage invalid action %s for %s", action, service
        )
        return {
            "error": f"Invalid action: {action}. Must be one of {valid_actions}"
        }
    enforcer.check_command(f"systemctl {action} {service}", tool=name)
    cmd = f"systemctl {action} {service}"
    result = await host.run_command(cmd)
    if result.get("exit_code") != 0:
        logger.warning(
            "service_manage %s %s failed: %s",
            action,
            service,
            result.get("stderr", "").strip(),
        )
    return {
        "service": service,
        "action": action,
        "result": "success" if result.get("exit_code") == 0 else "failed",
        "output": result["stdout"].strip() or result["stderr"].strip(),
    }
