"""Ubuntu Server MCP — server class and tool dispatcher."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.types import TextContent, Tool
from permission_engine import BaseMCPServer
from permission_engine.config_resolver import create_deny_all, resolve_user_config
from permission_engine.config_watcher import watch_config

from .host_access import HostAccess, create_host_access
from .tool_definitions import get_tool_definitions
from .tools import (
    append_file,
    docker_mgmt,
    execute,
    file_delete,
    journalctl,
    list_dir,
    read_file,
    service,
    system_info,
    write_file,
)

logger = logging.getLogger("ubuntu-mcp")

# Ubuntu-specific deny-all extends the base with connection config
DENY_ALL_UBUNTU = {
    **create_deny_all("ubuntu-server"),
    "connection": {"mode": "local", "local": {"mount_prefix": "/mnt/host"}},
}


class UbuntuServer(BaseMCPServer):

    def __init__(self, config_dir: str):
        tmp_path, config = resolve_user_config(config_dir, DENY_ALL_UBUNTU)
        super().__init__("ubuntu-mcp", tmp_path)
        self.host: HostAccess = create_host_access(config)
        self.setup()

    def setup(self):
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return get_tool_definitions()

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            return await self.handle_tool_call(name, arguments, self._dispatch)

    async def _dispatch(self, name: str, arguments: dict) -> dict | list:
        match name:
            case "ubuntu_read_file":
                return await read_file.read_file(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_write_file":
                return await write_file.write_file(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_append_file":
                return await append_file.append_file(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_file_delete":
                return await file_delete.file_delete(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_list_dir":
                return await list_dir.list_dir(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_exec":
                return await execute.execute(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_system_info":
                return await system_info.system_info(arguments)
            case "ubuntu_service_status":
                return await service.service_status(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_service_manage":
                return await service.service_manage(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_docker_ps":
                return await docker_mgmt.docker_ps(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_docker_logs":
                return await docker_mgmt.docker_logs(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_docker_restart":
                return await docker_mgmt.docker_restart(
                    arguments, self.enforcer, self.host, name
                )
            case "ubuntu_journalctl":
                return await journalctl.journalctl(
                    arguments, self.enforcer, self.host, name
                )
            case _:
                raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    """Entry point: parse args, load config, start MCP server."""
    parser = argparse.ArgumentParser(description="Ubuntu Server MCP")
    parser.add_argument(
        "--config-dir",
        default="/app/configs/ubuntu-server",
        help="Directory with per-user YAML configs",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default=os.environ.get("MCP_TRANSPORT", "sse"),
        help="Transport mode: sse (default) or stdio",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MCP_PORT", "8000")),
        help="Port for SSE transport (default 8000)",
    )
    args = parser.parse_args()

    config_dir = str(Path(args.config_dir).resolve())
    logger.info("Loading config dir: %s", config_dir)

    app = UbuntuServer(config_dir)

    watch_task = asyncio.create_task(
        watch_config(Path(config_dir), app.reload_config)
    )

    try:
        await app.run(transport=args.transport, port=args.port)
    finally:
        watch_task.cancel()
        try:
            await watch_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    asyncio.run(main())
