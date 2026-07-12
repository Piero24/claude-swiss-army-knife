"""Tool: Docker container management via Docker socket."""

import asyncio

from permission_engine import PermissionEnforcer


async def _docker_cmd(command: str, timeout: int = 30) -> dict:
    """Run a docker command."""
    try:
        process = await asyncio.create_subprocess_shell(
            f"docker {command}",
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
        return {"error": f"Command timed out after {timeout}s"}


async def docker_ps(
    args: dict, enforcer: PermissionEnforcer, name: str = ""
) -> dict:
    """List Docker containers.

    Args:
        args: {"all?": bool}
        enforcer: Permission enforcer.

    Returns:
        {containers: [...]}
    """
    show_all = args.get("all", False)
    cmd = (
        "ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'"
        if show_all
        else "ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'"
    )
    enforcer.check_command(f"docker {'ps -a' if show_all else 'ps'}", tool=name)

    result = await _docker_cmd(cmd)
    if result.get("error"):
        return result

    containers = []
    for line in result["stdout"].strip().split("\n"):
        if line.strip():
            parts = line.split("\t")
            if len(parts) >= 3:
                containers.append(
                    {
                        "name": parts[0],
                        "image": parts[1],
                        "status": parts[2],
                        "ports": parts[3] if len(parts) > 3 else "",
                    }
                )

    return {"containers": containers, "count": len(containers)}


async def docker_logs(
    args: dict, enforcer: PermissionEnforcer, name: str = ""
) -> dict:
    """Get logs from a Docker container.

    Args:
        args: {"container": str, "tail?": int}
        enforcer: Permission enforcer.

    Returns:
        {container, logs}
    """
    container = args["container"]
    tail = args.get("tail", 100)
    enforcer.check_command(f"docker logs {container}", tool=name)

    result = await _docker_cmd(f"logs --tail {tail} {container}")
    return {
        "container": container,
        "logs": result.get("stdout", "") + result.get("stderr", ""),
    }


async def docker_restart(
    args: dict, enforcer: PermissionEnforcer, name: str = ""
) -> dict:
    """Restart a Docker container.

    Args:
        args: {"container": str}
        enforcer: Permission enforcer.

    Returns:
        {container, restarted}
    """
    container = args["container"]
    enforcer.check_command(f"docker restart {container}", tool=name)

    result = await _docker_cmd(f"restart {container}")
    success = result.get("exit_code") == 0

    return {
        "container": container,
        "restarted": success,
        "output": result.get("stdout", "").strip()
        or result.get("stderr", "").strip(),
    }
