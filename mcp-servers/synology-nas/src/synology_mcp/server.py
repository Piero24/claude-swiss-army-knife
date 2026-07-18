"""Synology NAS MCP — stdio server entry point."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from permission_engine import BaseMCPServer

from .config_watcher import watch_config
from .dsm_client import DSMClient

logger = logging.getLogger("synology-mcp")


class SynologyServer(BaseMCPServer):

    def __init__(self, config_path: str):
        super().__init__("synology-mcp", config_path)

        nas_host = os.environ.get("SYNOLOGY_NAS_HOST", "192.168.1.100")
        nas_port = os.environ.get("SYNOLOGY_NAS_PORT", "5001")
        nas_user = os.environ.get("SYNOLOGY_NAS_USER", "")
        nas_pass = os.environ.get("SYNOLOGY_NAS_PASSWORD", "")
        self.base_url = f"https://{nas_host}:{nas_port}"

        self.dsm = DSMClient(self.base_url, nas_user, nas_pass)
        self.setup()

    def setup(self):
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return [
                Tool(
                    name="syno_file_list",
                    description="List files in a Synology shared folder.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "folder_path": {
                                "type": "string",
                                "description": "Path within a shared folder.",
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Max entries (default: 500).",
                            },
                        },
                        "required": ["folder_path"],
                    },
                ),
                Tool(
                    name="syno_file_read",
                    description="Read a file from the Synology NAS.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Full path to the file.",
                            },
                        },
                        "required": ["file_path"],
                    },
                ),
                Tool(
                    name="syno_file_write",
                    description="Write/upload a file to the Synology NAS.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "folder_path": {
                                "type": "string",
                                "description": "Parent folder path.",
                            },
                            "filename": {
                                "type": "string",
                                "description": "Name of the file to create.",
                            },
                            "content": {
                                "type": "string",
                                "description": "File content.",
                            },
                        },
                        "required": ["folder_path", "filename", "content"],
                    },
                ),
                Tool(
                    name="syno_file_delete",
                    description="Delete a file or folder on the Synology NAS.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Full path to delete.",
                            },
                            "recursive": {
                                "type": "boolean",
                                "description": "Recursively delete folders (default: false).",
                            },
                        },
                        "required": ["file_path"],
                    },
                ),
                Tool(
                    name="syno_file_move",
                    description="Move/rename a file or folder on the Synology NAS.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "src_path": {
                                "type": "string",
                                "description": "Source path.",
                            },
                            "dst_path": {
                                "type": "string",
                                "description": "Destination path.",
                            },
                        },
                        "required": ["src_path", "dst_path"],
                    },
                ),
                Tool(
                    name="syno_file_search",
                    description="Search for files by name on the Synology NAS.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query (name pattern).",
                            },
                            "folder_path": {
                                "type": "string",
                                "description": "Folder to search within (default: /).",
                            },
                        },
                        "required": ["query"],
                    },
                ),
                Tool(
                    name="syno_system_info",
                    description="Get Synology NAS system info: model, DSM version, CPU, RAM.",
                    inputSchema={"type": "object", "properties": {}},
                ),
                Tool(
                    name="syno_storage_info",
                    description="Get Synology NAS storage: volumes, usage, disk health.",
                    inputSchema={"type": "object", "properties": {}},
                ),
                Tool(
                    name="syno_list_shares",
                    description="List all shared folders on the Synology NAS.",
                    inputSchema={"type": "object", "properties": {}},
                ),
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            return await self.handle_tool_call(name, arguments, self._dispatch)

    async def _dispatch(self, name: str, arguments: dict) -> dict | list:
        match name:
            case "syno_file_list":
                self.enforcer.check("read", arguments["folder_path"], name)
                result = await self.dsm.file_list(
                    arguments["folder_path"], arguments.get("limit", 500)
                )
                return {"files": result, "count": len(result)}

            case "syno_file_read":
                self.enforcer.check("read", arguments["file_path"], name)
                content = await self.dsm.file_read(arguments["file_path"])
                return {
                    "content": content,
                    "path": arguments["file_path"],
                }

            case "syno_file_write":
                self.enforcer.check("write", arguments["folder_path"], name)
                result = await self.dsm.file_write(
                    arguments["folder_path"],
                    arguments["filename"],
                    arguments["content"],
                )
                return result

            case "syno_file_delete":
                self.enforcer.check("write", arguments["file_path"], name)
                result = await self.dsm.file_delete(
                    arguments["file_path"],
                    arguments.get("recursive", False),
                )
                return result

            case "syno_file_move":
                self.enforcer.check("write", arguments["src_path"], name)
                self.enforcer.check("write", arguments["dst_path"], name)
                result = await self.dsm.file_move(
                    arguments["src_path"], arguments["dst_path"]
                )
                return result

            case "syno_file_search":
                self.enforcer.check(
                    "read", arguments.get("folder_path", "/"), name
                )
                self.enforcer.check_command(name, name)
                result = await self.dsm.file_search(
                    arguments["query"], arguments.get("folder_path", "/")
                )
                return {"results": result, "count": len(result)}

            case "syno_system_info":
                self.enforcer.check_command(name, name)
                result = await self.dsm.system_info()
                return result

            case "syno_storage_info":
                self.enforcer.check_command(name, name)
                result = await self.dsm.storage_info()
                return {"volumes": result}

            case "syno_list_shares":
                result = await self.dsm.list_share()
                return {"shares": result, "count": len(result)}

            case _:
                raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Synology NAS MCP")
    parser.add_argument(
        "--config", default="/app/config.yaml", help="Path to config YAML"
    )
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    logger.info("Loading config from: %s", config_path)

    app = SynologyServer(str(config_path))

    try:
        await app.dsm.login()
        logger.info("Connected to Synology NAS at %s", app.base_url)
    except Exception as e:
        logger.warning(
            "DSM login failed at startup: %s — will retry on first use", e
        )

    watch_task = asyncio.create_task(
        watch_config(config_path, app.reload_config)
    )

    async with stdio_server() as (read_stream, write_stream):
        logger.info("Synology MCP server running (stdio mode)")
        await app.server.run(
            read_stream,
            write_stream,
            app.server.create_initialization_options(),
        )

    watch_task.cancel()
    try:
        await watch_task
    except asyncio.CancelledError:
        pass

    await app.dsm.logout()
    await app.dsm.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    asyncio.run(main())
