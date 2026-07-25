"""GitHub-specific customizations for the MCP proxy.

This module is auto-loaded by ProxyServer._load_custom().
Register hooks via the register() function.
"""

import logging

logger = logging.getLogger("github-custom")


def register(proxy):
    """Register GitHub-specific hooks on the proxy instance."""

    @proxy.hook("on_tools_cached")
    def filter_destructive(tools):
        """Optionally filter out tools that should never be exposed."""
        blocked = {"delete_file", "push_files", "merge_pull_request"}
        filtered = [t for t in tools if t.get("name") not in blocked]
        removed = len(tools) - len(filtered)
        if removed:
            logger.info("Filtered %d blocked tools", removed)
        return filtered

    @proxy.hook("on_before_tool_call")
    def log_tool_call(name, arguments):
        """Log every tool call for observability."""
        logger.info("Tool call: %s(%s)", name, arguments)
        return None  # Return None to pass through unchanged

    @proxy.hook("on_after_tool_call")
    def add_custom_field(name, result):
        """Add a custom metadata field to every tool result."""
        result["_proxy"] = "github-mcp"
        return result

    @proxy.hook("get_extra_sections")
    def repo_section(config):
        """Return custom sections for the web UI server detail page."""
        repos = config.get("repo_permissions", {})
        if not repos:
            return []
        return [
            {
                "key": "repo_permissions",
                "title": "Repository Permissions",
                "data": repos,
            }
        ]

    logger.info("GitHub custom hooks registered")
