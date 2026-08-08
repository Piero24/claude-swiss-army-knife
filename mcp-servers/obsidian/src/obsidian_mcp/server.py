"""Obsidian MCP — server class and tool dispatcher."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.types import TextContent, Tool
from permission_engine import BaseMCPServer
from permission_engine.config_resolver import create_deny_all, resolve_user_config
from permission_engine.config_watcher import watch_config

from .frontmatter import build_frontmatter, parse_frontmatter
from .tool_definitions import get_tool_definitions
from .tools.search import (
    get_all_tags,
    get_all_tags as _get_all_tags,
    ripgrep_search,
    ripgrep_search as _ripgrep_search,
    search_by_tag,
    search_by_tag as _search_by_tag,
)
from .vault_backend import LocalVaultBackend, create_backend
from .wikilinks import find_backlinks

logger = logging.getLogger("obsidian-mcp")

DENY_ALL = create_deny_all("obsidian")


class ObsidianServer(BaseMCPServer):

    def __init__(self, config_dir: str):
        tmp_path, config = resolve_user_config(config_dir, DENY_ALL)
        super().__init__("obsidian-mcp", tmp_path)
        self.vault: LocalVaultBackend = create_backend(config)
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
            case "obsidian_list_vault":
                subfolder = arguments.get("subfolder", "")
                if subfolder:
                    self.enforcer.check("read", subfolder, name)
                entries = await self.vault.list_vault(
                    subfolder, arguments.get("depth", 3)
                )
                return {"entries": entries, "count": len(entries)}

            case "obsidian_read_note":
                self.enforcer.check("read", arguments["path"], name)
                content = await self.vault.read_note(arguments["path"])
                fm, body = parse_frontmatter(content)
                return {
                    "path": arguments["path"],
                    "frontmatter": fm,
                    "body": body,
                }

            case "obsidian_write_note":
                self.enforcer.check("write", arguments["path"], name)
                body = arguments["content"]
                user_fm = arguments.get("frontmatter", {})
                if user_fm:
                    fm_text = build_frontmatter(user_fm)
                    body = fm_text + body
                filepath = await self.vault.write_note(arguments["path"], body)
                return {
                    "written": True,
                    "path": arguments["path"],
                    "file": str(filepath),
                }

            case "obsidian_delete_note":
                self.enforcer.check("write", arguments["path"], name)
                result = await self.vault.delete_note(
                    arguments["path"], arguments.get("permanent", False)
                )
                return result

            case "obsidian_search_notes":
                self.enforcer.check_command("rg *", name)
                query = arguments["query"]
                max_results = arguments.get("max_results", 20)
                regex = arguments.get("regex", False)
                results = _ripgrep_search(
                    str(self.vault.root), query, max_results, regex
                )
                return {"results": results, "count": len(results)}

            case "obsidian_search_by_tag":
                tag = arguments["tag"]
                results = await _search_by_tag(self.vault, tag)
                return {
                    "tag": tag,
                    "results": results,
                    "count": len(results),
                }

            case "obsidian_get_backlinks":
                self.enforcer.check("read", arguments["path"], name)
                backlinks = find_backlinks(self.vault.root, arguments["path"])
                return {
                    "target": arguments["path"],
                    "backlinks": backlinks,
                    "count": len(backlinks),
                }

            case "obsidian_get_tags":
                all_tags = await _get_all_tags(self.vault)
                return {"tags": all_tags}

            case "obsidian_get_frontmatter":
                self.enforcer.check("read", arguments["path"], name)
                content = await self.vault.read_note(arguments["path"])
                fm, _ = parse_frontmatter(content)
                return {"path": arguments["path"], "frontmatter": fm}

            case _:
                raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Obsidian MCP")
    parser.add_argument(
        "--config-dir",
        default="/app/configs/obsidian",
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

    app = ObsidianServer(config_dir)
    logger.info("Vault opened at %s", app.vault.root)

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
