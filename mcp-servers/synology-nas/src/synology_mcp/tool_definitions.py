"""Tool definitions for Synology NAS MCP."""

from mcp.types import Tool


def get_tool_definitions() -> list[Tool]:
    """Return the list of tool schemas provided by Synology NAS MCP."""
    return [
        Tool(
            name="syno_file_list",
            description="List files in a Synology shared folder.",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder_path": {
                        "type": "string",
                        "description": "Full shared folder path (e.g., /homes).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max items to return (default: 500).",
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
