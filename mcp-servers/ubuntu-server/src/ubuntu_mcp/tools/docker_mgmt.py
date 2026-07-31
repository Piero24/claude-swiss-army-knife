"""Tool: Docker container management via Docker socket."""

from permission_engine import PermissionEnforcer


async def docker_ps(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    show_all = args.get("all", False)
    fmt = "{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"
    cmd = f"docker {'ps -a' if show_all else 'ps'} --format '{fmt}'"
    enforcer.check_command(f"docker {'ps -a' if show_all else 'ps'}", tool=name)
    result = await host.run_host_command(cmd)
    if result.get("error"):
        return result
    containers = []
    for line in result["stdout"].strip().split("\n"):
        if line.strip():
            parts = line.split("\t")
            if len(parts) >= 3:
                containers.append({
                    "name": parts[0], "image": parts[1],
                    "status": parts[2], "ports": parts[3] if len(parts) > 3 else "",
                })
    return {"containers": containers, "count": len(containers)}


async def docker_logs(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    container = args["container"]
    tail = args.get("tail", 100)
    enforcer.check_command(f"docker logs {container}", tool=name)
    result = await host.run_host_command(f"docker logs --tail {tail} {container}")
    return {"container": container, "logs": result.get("stdout", "") + result.get("stderr", "")}


async def docker_restart(
    args: dict, enforcer: PermissionEnforcer, host, name: str = ""
) -> dict:
    container = args["container"]
    enforcer.check_command(f"docker restart {container}", tool=name)
    result = await host.run_host_command(f"docker restart {container}")
    return {
        "container": container,
        "restarted": result.get("exit_code") == 0,
        "output": result.get("stdout", "").strip() or result.get("stderr", "").strip(),
    }
