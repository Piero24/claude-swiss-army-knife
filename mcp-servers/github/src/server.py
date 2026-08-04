"""GitHub MCP proxy — entry point."""

import argparse
import asyncio
import logging
import os

from mcp.server.stdio import stdio_server
from mcp_proxy import ProxyServer

logger = logging.getLogger("github-mcp")


async def main() -> None:
    parser = argparse.ArgumentParser(description="GitHub MCP Proxy")
    parser.add_argument(
        "--config", default="/app/config.yaml", help="Path to config YAML file"
    )
    args = parser.parse_args()

    proxy = ProxyServer(args.config)
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
