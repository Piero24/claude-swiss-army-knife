"""Tool definitions for Link Manager MCP."""

from mcp.types import Tool


def get_tool_definitions() -> list[Tool]:
    """Return the list of tool schemas provided by Link Manager MCP."""
    return [
        Tool(
            name="link_list",
            description="List curated website and documentation links. Optionally filter by category or tag.",
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
