"""Obsidian MCP — stdio server entry point."""

import argparse
import asyncio
import json
import logging
import subprocess
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from permission_engine import PermissionEnforcer

from .config_watcher import watch_config
from .frontmatter import build_frontmatter, get_tags, get_title, parse_frontmatter
from .vault import Vault
from .wikilinks import extract_links, find_backlinks

logger = logging.getLogger("obsidian-mcp")

_enforcer: PermissionEnforcer | None = None
_vault: Vault | None = None
VAULT_PATH = "/data/vaults"


def get_enforcer() -> PermissionEnforcer:
    if _enforcer is None:
        raise RuntimeError("Enforcer not initialized")
    return _enforcer


def get_vault() -> Vault:
    if _vault is None:
        raise RuntimeError("Vault not initialized")
    return _vault


def reload_config() -> None:
    if _enforcer is not None:
        _enforcer.reload()
        logger.info("Config reloaded")


def create_server() -> Server:
    server = Server("obsidian-mcp")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="obsidian_list_vault",
                description="List the vault directory structure.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "subfolder": {
                            "type": "string",
                            "description": "Subfolder to list (default: root).",
                        },
                        "depth": {
                            "type": "integer",
                            "description": "Max depth (default: 3).",
                        },
                    },
                },
            ),
            Tool(
                name="obsidian_read_note",
                description="Read a note's full content with parsed frontmatter.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path relative to vault root.",
                        },
                    },
                    "required": ["path"],
                },
            ),
            Tool(
                name="obsidian_write_note",
                description="Create or update a note.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path relative to vault root.",
                        },
                        "content": {
                            "type": "string",
                            "description": "Markdown content.",
                        },
                        "frontmatter": {
                            "type": "object",
                            "description": "Optional YAML frontmatter to merge.",
                        },
                    },
                    "required": ["path", "content"],
                },
            ),
            Tool(
                name="obsidian_delete_note",
                description="Delete a note (soft-delete to .trash/ by default).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path relative to vault root.",
                        },
                        "permanent": {
                            "type": "boolean",
                            "description": "Permanently delete (default: false).",
                        },
                    },
                    "required": ["path"],
                },
            ),
            Tool(
                name="obsidian_search_notes",
                description="Full-text search across all notes using ripgrep.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query (supports regex).",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Max results (default: 20).",
                        },
                        "regex": {
                            "type": "boolean",
                            "description": "Treat query as regex (default: false).",
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="obsidian_search_by_tag",
                description="Find all notes with a specific frontmatter tag.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "tag": {
                            "type": "string",
                            "description": "Tag to search for.",
                        },
                    },
                    "required": ["tag"],
                },
            ),
            Tool(
                name="obsidian_get_backlinks",
                description="Find notes that link to a target note via [[wikilinks]].",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Target note path.",
                        },
                    },
                    "required": ["path"],
                },
            ),
            Tool(
                name="obsidian_get_tags",
                description="List all unique tags used across the vault.",
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="obsidian_get_frontmatter",
                description="Read only the YAML frontmatter of a note.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path relative to vault root.",
                        },
                    },
                    "required": ["path"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        enforcer = get_enforcer()
        vault = get_vault()

        try:
            match name:
                case "obsidian_list_vault":
                    subfolder = arguments.get("subfolder", "")
                    enforcer.check("read", subfolder or "/", name)
                    entries = vault.list_vault(
                        subfolder, arguments.get("depth", 3)
                    )
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {"entries": entries, "count": len(entries)},
                                indent=2,
                            ),
                        )
                    ]

                case "obsidian_read_note":
                    enforcer.check("read", arguments["path"], name)
                    content = vault.read_note(arguments["path"])
                    fm, body = parse_frontmatter(content)
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "path": arguments["path"],
                                    "frontmatter": fm,
                                    "body": body,
                                },
                                indent=2,
                                ensure_ascii=False,
                            ),
                        )
                    ]

                case "obsidian_write_note":
                    enforcer.check("write", arguments["path"], name)
                    body = arguments["content"]
                    user_fm = arguments.get("frontmatter", {})
                    if user_fm:
                        fm_text = build_frontmatter(user_fm)
                        body = fm_text + body
                    filepath = vault.write_note(arguments["path"], body)
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "written": True,
                                    "path": arguments["path"],
                                    "file": str(filepath),
                                },
                                indent=2,
                            ),
                        )
                    ]

                case "obsidian_delete_note":
                    enforcer.check("write", arguments["path"], name)
                    result = vault.delete_note(
                        arguments["path"], arguments.get("permanent", False)
                    )
                    return [
                        TextContent(
                            type="text", text=json.dumps(result, indent=2)
                        )
                    ]

                case "obsidian_search_notes":
                    enforcer.check("read", "/", name)
                    enforcer.check_command("rg *", name)
                    query = arguments["query"]
                    max_results = arguments.get("max_results", 20)
                    regex = arguments.get("regex", False)
                    results = _ripgrep_search(
                        str(vault.root), query, max_results, regex
                    )
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {"results": results, "count": len(results)},
                                indent=2,
                                ensure_ascii=False,
                            ),
                        )
                    ]

                case "obsidian_search_by_tag":
                    enforcer.check("read", "/", name)
                    tag = arguments["tag"]
                    results = _search_by_tag(vault, tag)
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "tag": tag,
                                    "results": results,
                                    "count": len(results),
                                },
                                indent=2,
                            ),
                        )
                    ]

                case "obsidian_get_backlinks":
                    enforcer.check("read", arguments["path"], name)
                    backlinks = find_backlinks(vault.root, arguments["path"])
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "target": arguments["path"],
                                    "backlinks": backlinks,
                                    "count": len(backlinks),
                                },
                                indent=2,
                            ),
                        )
                    ]

                case "obsidian_get_tags":
                    enforcer.check("read", "/", name)
                    all_tags = _get_all_tags(vault)
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps({"tags": all_tags}, indent=2),
                        )
                    ]

                case "obsidian_get_frontmatter":
                    enforcer.check("read", arguments["path"], name)
                    content = vault.read_note(arguments["path"])
                    fm, _ = parse_frontmatter(content)
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {"path": arguments["path"], "frontmatter": fm},
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


def _ripgrep_search(
    vault_root: str, query: str, max_results: int = 20, regex: bool = False
) -> list[dict]:
    """Search vault with ripgrep."""
    cmd = [
        "rg",
        "--type",
        "md",
        "--line-number",
        "--max-count",
        str(max_results),
    ]
    if not regex:
        cmd.append("--fixed-strings")
    cmd.extend(["--", query, vault_root])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        lines = (
            result.stdout.strip().split("\n") if result.stdout.strip() else []
        )
        return [
            {
                "file": parts[0],
                "line": int(parts[1]),
                "snippet": ":".join(parts[2:]) if len(parts) > 2 else "",
            }
            for line in lines
            if (parts := line.split(":", 2))
        ]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return [{"error": str(e)}]


def _search_by_tag(vault: Vault, tag: str) -> list[dict]:
    """Find all notes containing a specific tag."""
    results = []
    for note_path in vault.get_all_notes():
        try:
            content = note_path.read_text(encoding="utf-8")
            tags = get_tags(content)
            if tag in tags:
                rel_path = str(note_path.relative_to(vault.root))
                results.append(
                    {
                        "path": rel_path,
                        "title": get_title(content, note_path.stem),
                        "tags": tags,
                    }
                )
        except Exception:
            continue
    return results


def _get_all_tags(vault: Vault) -> list[dict]:
    """Get all unique tags with counts."""
    tag_counts: dict[str, int] = {}
    for note_path in vault.get_all_notes():
        try:
            content = note_path.read_text(encoding="utf-8")
            tags = get_tags(content)
            for tag in tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        except Exception:
            continue
    return [
        {"tag": tag, "count": count}
        for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1])
    ]


async def main() -> None:
    parser = argparse.ArgumentParser(description="Obsidian MCP")
    parser.add_argument(
        "--config", default="/app/config.yaml", help="Path to config YAML"
    )
    args = parser.parse_args()

    global _enforcer, _vault

    config_path = Path(args.config).resolve()
    _enforcer = PermissionEnforcer(str(config_path))
    logger.info(
        "Loaded config — %d path rules", len(_enforcer.config.permissions.paths)
    )

    _vault = Vault(VAULT_PATH)
    logger.info(
        "Vault opened at %s (%d notes)", VAULT_PATH, len(_vault.get_all_notes())
    )

    watch_task = asyncio.create_task(watch_config(config_path, reload_config))

    server = create_server()
    async with stdio_server() as (read_stream, write_stream):
        logger.info("Obsidian MCP server running (stdio mode)")
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )

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
