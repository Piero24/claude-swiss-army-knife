"""Link Manager MCP — stdio server for curated website and documentation links."""

import argparse
import asyncio
import logging
import os
import re
from pathlib import Path

import yaml
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from permission_engine import BaseMCPServer

from . import links as link_store

logger = logging.getLogger("link-manager-mcp")


def _load_config(path: str) -> dict:
    """Load the YAML config with env var substitution."""
    with open(path, "r") as f:
        raw = f.read()

    def _sub(m):
        var, _, default = m.group(1).partition(":-")
        return os.environ.get(var, default) or default

    raw = re.sub(r"\$\{([^}]+)\}", _sub, raw)
    return yaml.safe_load(raw) or {}


DENY_ALL_LINKS = {
    "server": {
        "name": "link-manager",
        "log_level": "INFO",
        "audit_log": "/var/log/mcp/audit.log",
    },
    "permissions": {
        "default_access": "none",
        "paths": [],
        "tools": [],
        "default_tool_access": "none",
    },
}


class LinkManagerServer(BaseMCPServer):
    """MCP server that provides tools for browsing and searching a curated
    collection of website and documentation links stored in the YAML config."""

    def __init__(self, config_dir: str):
        self._config_dir = Path(config_dir)
        # Resolve per-user config
        user_id = os.environ.get("MCP_USER_ID", "")
        if not user_id or user_id == "default":
            self._config_path = None
            config = dict(DENY_ALL_LINKS)
        else:
            user_config = self._config_dir / f"{user_id}.yaml"
            if user_config.exists():
                self._config_path = user_config
                config = _load_config(str(user_config))
            else:
                self._config_path = None
                config = dict(DENY_ALL_LINKS)
        import tempfile

        self._tmp_config = tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        )
        yaml.dump(config, self._tmp_config)
        self._tmp_config.flush()
        super().__init__("link-manager", self._tmp_config.name)
        self.setup()

    def _read_config(self) -> dict:
        """Re-read the config from disk."""
        if self._config_path and self._config_path.exists():
            return _load_config(str(self._config_path))
        return dict(DENY_ALL_LINKS)

    def setup(self):
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return [
                Tool(
                    name="link_list",
                    description="List all stored links, optionally filtered by category or tag.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "description": "Filter by category name.",
                            },
                            "tag": {
                                "type": "string",
                                "description": "Filter by tag.",
                            },
                        },
                    },
                ),
                Tool(
                    name="link_search",
                    description="Search links by name, description, or URL (case-insensitive).",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search term to match against name, description, and URL.",
                            },
                        },
                        "required": ["query"],
                    },
                ),
                Tool(
                    name="link_get",
                    description="Get full details of a specific link by exact name.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Exact link name.",
                            },
                        },
                        "required": ["name"],
                    },
                ),
                Tool(
                    name="link_categories",
                    description="List all categories with the number of links in each.",
                    inputSchema={"type": "object", "properties": {}},
                ),
                Tool(
                    name="link_add",
                    description="Add a new link to the collection. DESTRUCTIVE — enable only for trusted users.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Link name (must be unique).",
                            },
                            "url": {
                                "type": "string",
                                "description": "The URL.",
                            },
                            "description": {
                                "type": "string",
                                "description": "Optional description.",
                            },
                            "category": {
                                "type": "string",
                                "description": "Optional category.",
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Optional list of tags.",
                            },
                        },
                        "required": ["name", "url"],
                    },
                ),
                Tool(
                    name="link_remove",
                    description="Remove a link by name. DESTRUCTIVE — enable only for trusted users.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Exact name of the link to remove.",
                            },
                        },
                        "required": ["name"],
                    },
                ),
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            return await self.handle_tool_call(name, arguments, self._dispatch)

    async def _dispatch(self, name: str, arguments: dict) -> dict | list:
        config = self._read_config()

        match name:
            case "link_list":
                return {
                    "links": link_store.list_links(
                        config,
                        category=arguments.get("category"),
                        tag=arguments.get("tag"),
                    ),
                    "count": len(
                        link_store.list_links(
                            config,
                            category=arguments.get("category"),
                            tag=arguments.get("tag"),
                        )
                    ),
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
                # Persist the config
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
        if not self._config_path:
            logger.warning("Cannot save config: no per-user config resolved")
            return
        import yaml as yaml_writer

        with open(self._config_path, "w") as f:
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
    args = parser.parse_args()

    config_dir = str(Path(args.config_dir).resolve())
    logger.info("Loading config dir: %s", config_dir)

    app = LinkManagerServer(config_dir)
    logger.info("Link Manager MCP server starting (stdio mode)")

    async with stdio_server() as (read_stream, write_stream):
        await app.server.run(
            read_stream,
            write_stream,
            app.server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
