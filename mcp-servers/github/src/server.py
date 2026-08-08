"""GitHub MCP proxy — entry point."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp.server.stdio import stdio_server
from mcp_proxy import ProxyServer

from permission_engine.config_resolver import create_deny_all, resolve_user_config

logger = logging.getLogger("github-mcp")

DENY_ALL_GITHUB = {
    **create_deny_all("github-mcp"),
    "proxy": {"command": "true", "args": []},
}


def _resolve_github_config(config_dir: str) -> str:
    """Resolve per-user config path, or return a deny-all temp file."""
    path, _ = resolve_user_config(config_dir, DENY_ALL_GITHUB)
    return path


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
