"""Tool: systemd journalctl query."""

import logging
import shlex

logger = logging.getLogger(__name__)


async def journalctl(args: dict, enforcer, host, name: str = "") -> dict:
    """Query systemd journal."""
    unit = args.get("unit", "")
    lines = args.get("lines", 50)
    since = args.get("since", "")

    # Check intent against permission engine without breaking on shell spaces
    check_str = "journalctl"
    if unit:
        check_str += f" -u {unit}"
    if since:
        check_str += f" --since {since}"
    enforcer.check_command(check_str, name)

    # Build actual shell command with safe quotes
    cmd = "journalctl"
    if unit:
        cmd += f" -u {shlex.quote(unit)}"
    if since:
        cmd += f" --since={shlex.quote(since)}"
    cmd += f" -n {lines} --no-pager"

    result = await host.run_command(cmd, timeout=15)
    return {
        "query": cmd,
        "output": result.get("stdout", ""),
    }
