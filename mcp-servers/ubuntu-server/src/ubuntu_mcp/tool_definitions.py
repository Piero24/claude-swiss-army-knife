"""Tool definitions for Ubuntu Server MCP."""

from mcp.types import Tool


def get_tool_definitions() -> list[Tool]:
    """Return the list of tool schemas provided by Ubuntu Server MCP."""
    return [
        Tool(
            name="ubuntu_read_file",
            description="Read a file from the Ubuntu server filesystem.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file on the host.",
                    },
                },
                "required": ["path"],
            },
        ),
        Tool(
            name="ubuntu_write_file",
            description="Write content to a file on the Ubuntu server.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file on the host.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file.",
                    },
                },
                "required": ["path", "content"],
            },
        ),
        Tool(
            name="ubuntu_append_file",
            description="Append content to a file on the Ubuntu server.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file on the host.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to append.",
                    },
                },
                "required": ["path", "content"],
            },
        ),
        Tool(
            name="ubuntu_file_delete",
            description="Delete a file on the Ubuntu server.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file to delete.",
                    },
                },
                "required": ["path"],
            },
        ),
        Tool(
            name="ubuntu_list_dir",
            description="List the contents of a directory on the Ubuntu server.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the directory.",
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "Whether to list recursively (default: false).",
                    },
                },
                "required": ["path"],
            },
        ),
        Tool(
            name="ubuntu_exec",
            description="Execute a shell command on the Ubuntu server (subject to command allowlist).",
            inputSchema={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute.",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds (default: 30).",
                    },
                },
                "required": ["command"],
            },
        ),
        Tool(
            name="ubuntu_system_info",
            description="Get system information: CPU, RAM, disk, load average, uptime.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="ubuntu_service_status",
            description="Check the status of a systemd service.",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Name of the systemd service.",
                    },
                },
                "required": ["service"],
            },
        ),
        Tool(
            name="ubuntu_service_manage",
            description="Manage a systemd service (start, stop, restart, reload).",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Name of the systemd service.",
                    },
                    "action": {
                        "type": "string",
                        "enum": ["start", "stop", "restart", "reload"],
                        "description": "Action to perform.",
                    },
                },
                "required": ["service", "action"],
            },
        ),
        Tool(
            name="ubuntu_docker_ps",
            description="List Docker containers and their status.",
            inputSchema={
                "type": "object",
                "properties": {
                    "all": {
                        "type": "boolean",
                        "description": "Show all containers including stopped (default: false).",
                    },
                },
            },
        ),
        Tool(
            name="ubuntu_docker_logs",
            description="Get logs from a Docker container.",
            inputSchema={
                "type": "object",
                "properties": {
                    "container": {
                        "type": "string",
                        "description": "Name of the container.",
                    },
                    "tail": {
                        "type": "integer",
                        "description": "Number of lines to retrieve (default: 100).",
                    },
                },
                "required": ["container"],
            },
        ),
        Tool(
            name="ubuntu_docker_restart",
            description="Restart a Docker container.",
            inputSchema={
                "type": "object",
                "properties": {
                    "container": {
                        "type": "string",
                        "description": "Name of the container to restart.",
                    },
                },
                "required": ["container"],
            },
        ),
        Tool(
            name="ubuntu_journalctl",
            description="Query the systemd journal.",
            inputSchema={
                "type": "object",
                "properties": {
                    "unit": {
                        "type": "string",
                        "description": "Filter by systemd unit name.",
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of lines (default: 50).",
                    },
                    "since": {
                        "type": "string",
                        "description": "Show entries since (e.g., '1 hour ago', 'today').",
                    },
                },
            },
        ),
    ]
