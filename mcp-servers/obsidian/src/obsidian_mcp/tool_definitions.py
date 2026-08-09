"""Tool definitions for Obsidian MCP."""

from mcp.types import Tool


def get_tool_definitions() -> list[Tool]:
    """Return the list of tool schemas provided by Obsidian MCP."""
    return [
        Tool(
            name="obsidian_list_vault",
            description="List folders and notes in the vault.",
            inputSchema={
                "type": "object",
                "properties": {
                    "subfolder": {
                        "type": "string",
                        "description": "Subfolder path relative to vault root (default: root).",
                    },
                    "depth": {
                        "type": "integer",
                        "description": "Max folder depth to list (default: 3).",
                    },
                },
            },
        ),
        Tool(
            name="obsidian_read_note",
            description="Read a markdown note.",
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
            name="obsidian_append_note",
            description="Append content to the end of an existing note.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to vault root.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Markdown content to append.",
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
