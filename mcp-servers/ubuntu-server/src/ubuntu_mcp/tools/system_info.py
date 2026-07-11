"""Tool: get host system information."""

import time
from datetime import datetime

import psutil


async def system_info(args: dict) -> dict:
    """Get system resource information.

    Args:
        args: {} (no arguments required)

    Returns:
        {cpu, memory, disk, load, uptime_seconds, boot_time}
    """
    cpu_pct = psutil.cpu_percent(interval=0.5)
    cpu_cores = psutil.cpu_count(logical=True)
    cpu_cores_physical = psutil.cpu_count(logical=False)

    mem = psutil.virtual_memory()
    load = psutil.getloadavg()
    boot = psutil.boot_time()

    # Root filesystem
    disk = psutil.disk_usage("/")

    return {
        "cpu": {
            "percent": cpu_pct,
            "cores_logical": cpu_cores,
            "cores_physical": cpu_cores_physical,
        },
        "memory": {
            "total_gb": round(mem.total / (1024**3), 1),
            "used_gb": round(mem.used / (1024**3), 1),
            "available_gb": round(mem.available / (1024**3), 1),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb": round(disk.used / (1024**3), 1),
            "free_gb": round(disk.free / (1024**3), 1),
            "percent": disk.percent,
        },
        "load": {
            "1m": round(load[0], 2),
            "5m": round(load[1], 2),
            "15m": round(load[2], 2),
        },
        "uptime_seconds": round(time.time() - boot),
        "boot_time": datetime.fromtimestamp(boot).isoformat(),
    }
