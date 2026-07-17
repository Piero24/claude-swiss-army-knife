"""Synology NAS MCP — stdio server entry point."""

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from permission_engine import PermissionEnforcer, _current_user_id, _observed_subagent_id

from .config_watcher import watch_config
from .dsm_client import DSMClient

logger = logging.getLogger("synology-mcp")

_enforcer: PermissionEnforcer | None = None
_dsm_client: DSMClient | None = None


def get_enforcer() -> PermissionEnforcer:
    if _enforcer is None:
        raise RuntimeError("Enforcer not initialized")
    return _enforcer


def get_dsm() -> DSMClient:
    if _dsm_client is None:
        raise RuntimeError("DSM client not initialized")
    return _dsm_client


def reload_config() -> None:
    if _enforcer is not None:
        _enforcer.reload()
        logger.info("Config reloaded")


def create_server() -> Server:
    server = Server("synology-mcp")

    @server.list_tools()
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

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        enforcer = get_enforcer()
        dsm = get_dsm()

        # Set agent identity from environment (user-configured in Claude Code settings)
        user_id = os.environ.get("MCP_USER_ID", "default")
        _current_user_id.set(user_id)
        _observed_subagent_id.set(os.environ.get("CLAUDE_AGENT_ID", ""))

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
                case "syno_file_list":
                    enforcer.check("read", arguments["folder_path"], name)
                    result = await dsm.file_list(
                        arguments["folder_path"], arguments.get("limit", 500)
                    )
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {"files": result, "count": len(result)},
                                indent=2,
                            ),
                        )
                    ]

                case "syno_file_read":
                    enforcer.check("read", arguments["file_path"], name)
                    content = await dsm.file_read(arguments["file_path"])
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "content": content,
                                    "path": arguments["file_path"],
                                },
                                indent=2,
                            ),
                        )
                    ]

                case "syno_file_write":
                    enforcer.check("write", arguments["folder_path"], name)
                    result = await dsm.file_write(
                        arguments["folder_path"],
                        arguments["filename"],
                        arguments["content"],
                    )
                    return [
                        TextContent(
                            type="text", text=json.dumps(result, indent=2)
                        )
                    ]

                case "syno_file_delete":
                    enforcer.check("write", arguments["file_path"], name)
                    result = await dsm.file_delete(
                        arguments["file_path"],
                        arguments.get("recursive", False),
                    )
                    return [
                        TextContent(
                            type="text", text=json.dumps(result, indent=2)
                        )
                    ]

                case "syno_file_move":
                    enforcer.check("write", arguments["src_path"], name)
                    enforcer.check("write", arguments["dst_path"], name)
                    result = await dsm.file_move(
                        arguments["src_path"], arguments["dst_path"]
                    )
                    return [
                        TextContent(
                            type="text", text=json.dumps(result, indent=2)
                        )
                    ]

                case "syno_file_search":
                    enforcer.check(
                        "read", arguments.get("folder_path", "/"), name
                    )
                    enforcer.check_command(name, name)
                    result = await dsm.file_search(
                        arguments["query"], arguments.get("folder_path", "/")
                    )
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {"results": result, "count": len(result)},
                                indent=2,
                            ),
                        )
                    ]

                case "syno_system_info":
                    enforcer.check_command(name, name)
                    result = await dsm.system_info()
                    return [
                        TextContent(
                            type="text", text=json.dumps(result, indent=2)
                        )
                    ]

                case "syno_storage_info":
                    enforcer.check_command(name, name)
                    result = await dsm.storage_info()
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps({"volumes": result}, indent=2),
                        )
                    ]

                case "syno_list_shares":
                    result = await dsm.list_share()
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {"shares": result, "count": len(result)},
                                indent=2,
                            ),
                        )
                    ]

                case _:
                    return [
                        TextContent(type="text", text=f"Unknown tool: {name}")
                    ]

        except Exception as e:
            return [
                TextContent(
                    type="text", text=json.dumps({"error": str(e)}, indent=2)
                )
            ]

    return server


async def main() -> None:
    parser = argparse.ArgumentParser(description="Synology NAS MCP")
    parser.add_argument(
        "--config", default="/app/config.yaml", help="Path to config YAML"
    )
    args = parser.parse_args()

    global _enforcer, _dsm_client

    # Load permission config
    config_path = Path(args.config).resolve()
    _enforcer = PermissionEnforcer(str(config_path))
    logger.info(
        "Loaded config — %d path rules", len(_enforcer.config.permissions.paths)
    )

    # Initialize DSM client
    nas_host = os.environ.get("SYNOLOGY_NAS_HOST", "192.168.1.100")
    nas_port = os.environ.get("SYNOLOGY_NAS_PORT", "5001")
    nas_user = os.environ.get("SYNOLOGY_NAS_USER", "")
    nas_pass = os.environ.get("SYNOLOGY_NAS_PASSWORD", "")
    base_url = f"https://{nas_host}:{nas_port}"

    _dsm_client = DSMClient(base_url, nas_user, nas_pass)
    try:
        await _dsm_client.login()
        logger.info("Connected to Synology NAS at %s", base_url)
    except Exception as e:
        logger.warning(
            "DSM login failed at startup: %s — will retry on first use", e
        )

    # Start config watcher
    watch_task = asyncio.create_task(watch_config(config_path, reload_config))

    # Run MCP server
    server = create_server()
    async with stdio_server() as (read_stream, write_stream):
        logger.info("Synology MCP server running (stdio mode)")
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )

    watch_task.cancel()
    try:
        await watch_task
    except asyncio.CancelledError:
        pass

    await _dsm_client.logout()
    await _dsm_client.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    asyncio.run(main())
