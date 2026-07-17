"""Ubuntu Server MCP — stdio server entry point.

Provides tools for managing an Ubuntu server: file I/O, command execution,
systemd service management, Docker container management, and system monitoring.
All operations are guarded by the shared permission engine.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from permission_engine import PermissionEnforcer, _current_agent_id

from .config_watcher import watch_config
from .path_mapper import PathMapper
from .tools import (
    append_file,
    docker_mgmt,
    execute,
    list_dir,
    read_file,
    service,
    system_info,
    write_file,
)

logger = logging.getLogger("ubuntu-mcp")

# Mount prefix inside the container
MOUNT_PREFIX = "/mnt/host"

# Global state (protected by asyncio lock)
_enforcer: PermissionEnforcer | None = None
_path_mapper: PathMapper = PathMapper(MOUNT_PREFIX)
_config_lock = asyncio.Lock()


def get_enforcer() -> PermissionEnforcer:
    """Get the current enforcer instance."""
    if _enforcer is None:
        raise RuntimeError("Enforcer not initialized")
    return _enforcer


def reload_config() -> None:
    """Reload the permission config from disk."""
    global _enforcer
    if _enforcer is not None:
        _enforcer.reload()
        logger.info(
            "Permission config reloaded — %d path rules, %d command rules",
            len(_enforcer.config.permissions.paths),
            len(_enforcer.config.permissions.commands),
        )


def create_server() -> Server:
    """Create and configure the MCP server with all tools."""
    server = Server("ubuntu-mcp")

    # ── read_file ──
    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="ubuntu_read_file",
                description="Read a file from the Ubuntu server filesystem.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path to the file on the host.",
                        },
                    },
                    "required": ["path"],
                },
            ),
            Tool(
                name="ubuntu_write_file",
                description="Write content to a file on the Ubuntu server (overwrites if exists).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path to the file on the host.",
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write to the file.",
                        },
                    },
                    "required": ["path", "content"],
                },
            ),
            Tool(
                name="ubuntu_append_file",
                description="Append content to a file on the Ubuntu server.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path to the file on the host.",
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to append.",
                        },
                    },
                    "required": ["path", "content"],
                },
            ),
            Tool(
                name="ubuntu_list_dir",
                description="List the contents of a directory on the Ubuntu server.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path to the directory.",
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "Whether to list recursively (default: false).",
                        },
                    },
                    "required": ["path"],
                },
            ),
            Tool(
                name="ubuntu_exec",
                description="Execute a shell command on the Ubuntu server (subject to command allowlist).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The shell command to execute.",
                        },
                        "timeout": {
                            "type": "integer",
                            "description": "Timeout in seconds (default: 30).",
                        },
                    },
                    "required": ["command"],
                },
            ),
            Tool(
                name="ubuntu_system_info",
                description="Get system information: CPU, RAM, disk, load average, uptime.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                },
            ),
            Tool(
                name="ubuntu_service_status",
                description="Check the status of a systemd service.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "service": {
                            "type": "string",
                            "description": "Name of the systemd service.",
                        },
                    },
                    "required": ["service"],
                },
            ),
            Tool(
                name="ubuntu_service_manage",
                description="Manage a systemd service (start, stop, restart, reload).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "service": {
                            "type": "string",
                            "description": "Name of the systemd service.",
                        },
                        "action": {
                            "type": "string",
                            "enum": ["start", "stop", "restart", "reload"],
                            "description": "Action to perform.",
                        },
                    },
                    "required": ["service", "action"],
                },
            ),
            Tool(
                name="ubuntu_docker_ps",
                description="List Docker containers and their status.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "all": {
                            "type": "boolean",
                            "description": "Show all containers including stopped (default: false).",
                        },
                    },
                },
            ),
            Tool(
                name="ubuntu_docker_logs",
                description="Get logs from a Docker container.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "container": {
                            "type": "string",
                            "description": "Name of the container.",
                        },
                        "tail": {
                            "type": "integer",
                            "description": "Number of lines to retrieve (default: 100).",
                        },
                    },
                    "required": ["container"],
                },
            ),
            Tool(
                name="ubuntu_docker_restart",
                description="Restart a Docker container.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "container": {
                            "type": "string",
                            "description": "Name of the container to restart.",
                        },
                    },
                    "required": ["container"],
                },
            ),
            Tool(
                name="ubuntu_journalctl",
                description="Query the systemd journal.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "unit": {
                            "type": "string",
                            "description": "Filter by systemd unit name.",
                        },
                        "lines": {
                            "type": "integer",
                            "description": "Number of lines (default: 50).",
                        },
                        "since": {
                            "type": "string",
                            "description": "Show entries since (e.g., '1 hour ago', 'today').",
                        },
                    },
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        enforcer = get_enforcer()

        # Set agent identity from environment (user-configured in Claude Code settings)
        user_id = os.environ.get("MCP_USER_ID", "default")
        _current_agent_id.set(user_id)

        # Authenticate if credentials are provided
        user_key = os.environ.get("MCP_USER_KEY", "")
        try:
            enforcer.authenticate(user_id, user_key)
        except Exception as e:
            return [
                TextContent(
                    type="text", text=json.dumps({"error": str(e)}, indent=2)
                )
            ]

        # Check tool-level access control
        try:
            enforcer.check_tool_access(user_id, name)
        except Exception as e:
            return [
                TextContent(
                    type="text", text=json.dumps({"error": str(e)}, indent=2)
                )
            ]

        try:
            match name:
                case "ubuntu_read_file":
                    result = await read_file.read_file(
                        arguments, enforcer, MOUNT_PREFIX, name
                    )
                case "ubuntu_write_file":
                    result = await write_file.write_file(
                        arguments, enforcer, MOUNT_PREFIX, name
                    )
                case "ubuntu_append_file":
                    result = await append_file.append_file(
                        arguments, enforcer, MOUNT_PREFIX, name
                    )
                case "ubuntu_list_dir":
                    result = await list_dir.list_dir(
                        arguments, enforcer, MOUNT_PREFIX, name
                    )
                case "ubuntu_exec":
                    result = await execute.execute(arguments, enforcer, name)
                case "ubuntu_system_info":
                    result = await system_info.system_info(arguments)
                case "ubuntu_service_status":
                    result = await service.service_status(
                        arguments, enforcer, name
                    )
                case "ubuntu_service_manage":
                    result = await service.service_manage(
                        arguments, enforcer, name
                    )
                case "ubuntu_docker_ps":
                    result = await docker_mgmt.docker_ps(
                        arguments, enforcer, name
                    )
                case "ubuntu_docker_logs":
                    result = await docker_mgmt.docker_logs(
                        arguments, enforcer, name
                    )
                case "ubuntu_docker_restart":
                    result = await docker_mgmt.docker_restart(
                        arguments, enforcer, name
                    )
                case "ubuntu_journalctl":
                    result = await _journalctl(arguments, enforcer, name)
                case _:
                    return [
                        TextContent(type="text", text=f"Unknown tool: {name}")
                    ]

            import json

            return [
                TextContent(
                    type="text",
                    text=json.dumps(result, indent=2, ensure_ascii=False),
                )
            ]

        except Exception as e:
            import json

            return [
                TextContent(
                    type="text", text=json.dumps({"error": str(e)}, indent=2)
                )
            ]

    return server


async def _journalctl(
    args: dict, enforcer: PermissionEnforcer, name: str = ""
) -> dict:
    """Query systemd journal."""
    import asyncio

    unit = args.get("unit", "")
    lines = args.get("lines", 50)
    since = args.get("since", "")

    cmd = "journalctl"
    if unit:
        cmd += f" -u {unit}"
    if since:
        cmd += f" --since='{since}'"
    cmd += f" -n {lines} --no-pager"

    enforcer.check_command("journalctl *", name)
    result = await execute.execute(
        {"command": cmd, "timeout": 15}, enforcer, name
    )
    return {
        "query": cmd,
        "output": result.get("stdout", ""),
    }


async def main() -> None:
    """Entry point: parse args, load config, start MCP server with hot-reload."""
    parser = argparse.ArgumentParser(description="Ubuntu Server MCP")
    parser.add_argument(
        "--config", default="/app/config.yaml", help="Path to config YAML file"
    )
    args = parser.parse_args()

    # Initialize permission enforcer
    global _enforcer
    config_path = Path(args.config).resolve()
    logger.info("Loading config from: %s", config_path)
    _enforcer = PermissionEnforcer(str(config_path))
    logger.info(
        "Loaded %d path rules, %d command rules",
        len(_enforcer.config.permissions.paths),
        len(_enforcer.config.permissions.commands),
    )

    # Start config file watcher (background task)
    watch_task = asyncio.create_task(watch_config(config_path, reload_config))

    # Run MCP server
    server = create_server()
    async with stdio_server() as (read_stream, write_stream):
        logger.info("Ubuntu MCP server running (stdio mode)")
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )

    # Cleanup
    watch_task.cancel()
    try:
        await watch_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    asyncio.run(main())
