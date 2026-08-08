"""Link Manager MCP — stdio server for curated website and documentation links."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.types import TextContent, Tool
from permission_engine import BaseMCPServer
from permission_engine.config_resolver import create_deny_all, resolve_user_config
from permission_engine.config_watcher import watch_config

from . import links as link_store
from .tool_definitions import get_tool_definitions

logger = logging.getLogger("link-manager-mcp")

DENY_ALL_LINKS = create_deny_all("link-manager")


class LinkManagerServer(BaseMCPServer):
    """MCP server that provides tools for browsing and searching a curated
    collection of website and documentation links stored in the YAML config."""

    def __init__(self, config_dir: str):
        self._config_dir = Path(config_dir)
        tmp_path, _ = resolve_user_config(config_dir, DENY_ALL_LINKS)
        super().__init__(
            "link-manager",
            tmp_path,
            config_dir=config_dir,
            tool_names=[t.name for t in get_tool_definitions()],
        )
        self.setup()

    def _resolve_config_path(self) -> Path | None:
        """Resolve the per-user config file using the request-time user ID."""
        user_id = self._request_user_id_val or os.environ.get("MCP_USER_ID", "")
        if user_id and user_id != "default":
            return self._config_dir / f"{user_id}.yaml"
        return None

    def _read_config(self) -> dict:
        """Re-read the config from disk."""
        config_path = self._resolve_config_path()
        if config_path and config_path.exists():
            import yaml

            with open(config_path, "r") as f:
                return yaml.safe_load(f) or {}
        return dict(DENY_ALL_LINKS)

    def setup(self):
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return get_tool_definitions()

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            return await self.handle_tool_call(name, arguments, self._dispatch)

    async def _dispatch(self, name: str, arguments: dict) -> dict | list:
        config = self._read_config()

        match name:
            case "link_list":
                links = link_store.list_links(
                    config,
                    category=arguments.get("category"),
                    tag=arguments.get("tag"),
                )
                return {
                    "links": links,
                    "count": len(links),
                }

            case "link_search":
                results = link_store.search_links(config, arguments["query"])
                return {"results": results, "count": len(results)}

            case "link_get":
                link = link_store.get_link(config, arguments["name"])
                if link is None:
                    return {"error": f"Link not found: {arguments['name']}"}
                return link

            case "link_categories":
                return {"categories": link_store.list_categories(config)}

            case "link_add":
                link = link_store.add_link(
                    config,
                    arguments["name"],
                    arguments["url"],
                    description=arguments.get("description", ""),
                    category=arguments.get("category", ""),
                    tags=arguments.get("tags", []),
                )
                self._save_config(config)
                return {"added": True, "link": link}

            case "link_remove":
                removed = link_store.remove_link(config, arguments["name"])
                if removed:
                    self._save_config(config)
                return {"removed": removed, "name": arguments["name"]}

            case _:
                raise ValueError(f"Unknown tool: {name}")

    def _save_config(self, config: dict) -> None:
        """Write the config back to disk."""
        config_path = self._resolve_config_path()
        if not config_path:
            logger.warning("Cannot save config: no per-user config resolved")
            return
        import yaml as yaml_writer

        with open(config_path, "w") as f:
            yaml_writer.dump(
                config, f, default_flow_style=False, allow_unicode=True
            )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Link Manager MCP")
    parser.add_argument(
        "--config-dir",
        default="/app/configs/link-manager",
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

    app = LinkManagerServer(config_dir)
    logger.info("Link Manager MCP server starting (%s mode)", args.transport)

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
