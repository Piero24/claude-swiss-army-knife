"""GitHub MCP proxy — entry point."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.server.stdio import stdio_server
from mcp_proxy import ProxyServer

logger = logging.getLogger("github-mcp")


def _resolve_github_config(config_dir: str) -> str:
    """Resolve per-user config path, or return a deny-all temp file."""
    import tempfile

    import yaml

    user_id = os.environ.get("MCP_USER_ID", "")
    deny_all = {
        "server": {
            "name": "github-mcp",
            "log_level": "INFO",
            "audit_log": "/var/log/mcp/audit.log",
        },
        "proxy": {"command": "true", "args": []},
        "permissions": {
            "default_access": "none",
            "tools": [],
            "default_tool_access": "none",
        },
    }
    if not user_id or user_id == "default":
        config = deny_all
    else:
        user_config = Path(config_dir) / f"{user_id}.yaml"
        if user_config.exists():
            return str(user_config)
        config = deny_all
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False)
    yaml.dump(config, tmp)
    tmp.flush()
    return tmp.name


async def main() -> None:
    parser = argparse.ArgumentParser(description="GitHub MCP Proxy")
    parser.add_argument(
        "--config-dir",
        default="/app/configs/github-mcp",
        help="Directory with per-user YAML configs",
    )
    args = parser.parse_args()

    config_path = _resolve_github_config(args.config_dir)
    proxy = ProxyServer(config_path)
    proxy.setup()

    async with stdio_server() as (read_stream, write_stream):
        logger.info("GitHub MCP proxy running (stdio mode)")
        await proxy.server.run(
            read_stream,
            write_stream,
            proxy.server.create_initialization_options(),
        )


if __name__ == "__main__":
    log_level = os.environ.get("LOG_LEVEL", "WARNING")
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.WARNING),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    asyncio.run(main())
