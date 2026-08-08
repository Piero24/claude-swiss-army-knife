"""Synology NAS MCP — server class and tool dispatcher."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.types import TextContent, Tool
from permission_engine import BaseMCPServer
from permission_engine.config_resolver import create_deny_all, resolve_user_config
from permission_engine.config_watcher import watch_config

from .dsm_client import DSMClient, _get_synology_setting
from .tool_definitions import get_tool_definitions

logger = logging.getLogger("synology-mcp")

DENY_ALL_SYNOLOGY = create_deny_all("synology-nas")


class SynologyServer(BaseMCPServer):

    def __init__(self, config_dir: str):
        tmp_path, config = resolve_user_config(config_dir, DENY_ALL_SYNOLOGY)
        super().__init__(
            "synology-mcp",
            tmp_path,
            config_dir=config_dir,
            tool_names=[t.name for t in get_tool_definitions()],
        )

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
            return get_tool_definitions()

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
                folder = arguments.get(
                    "folder_path", ""
                ) or _get_synology_setting(
                    "defaultSearchPath", "SYNOLOGY_DEFAULT_SEARCH_PATH", "/home"
                )
                if folder:
                    self.enforcer.check("read", folder, name)
                result = await self.dsm.file_search(arguments["query"], folder)
                return {"results": result, "count": len(result)}

            case "syno_system_info":
                result = await self.dsm.system_info()
                return result

            case "syno_storage_info":
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
        "--config-dir",
        default="/app/configs/synology-nas",
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

    app = SynologyServer(config_dir)

    try:
        await app.dsm.login()
        logger.info("Connected to Synology NAS at %s", app.base_url)
    except Exception as e:
        logger.warning(
            "DSM login failed at startup: %s — will retry on first use", e
        )

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

        await app.dsm.logout()
        await app.dsm.close()


if __name__ == "__main__":
    asyncio.run(main())
