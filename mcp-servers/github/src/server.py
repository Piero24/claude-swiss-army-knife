"""GitHub MCP proxy — entry point."""

import argparse
import asyncio
import logging
import os
from pathlib import Path

from mcp_proxy import ProxyServer
from permission_engine.config_resolver import create_deny_all, resolve_user_config
from permission_engine.config_watcher import watch_config

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
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default=os.environ.get("MCP_TRANSPORT", "sse"),
        help="Transport mode: sse (default) or stdio",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MCP_PORT", "8000")),
        help="Port for SSE transport (default 8000)",
    )
    args = parser.parse_args()

    config_dir = str(Path(args.config_dir).resolve())
    config_path = _resolve_github_config(config_dir)
    proxy = ProxyServer(config_path, config_dir=config_dir)
    proxy.setup()

    logger.info("GitHub MCP proxy running (%s mode)", args.transport)

    watch_task = asyncio.create_task(
        watch_config(Path(config_dir), proxy.reload_config)
    )

    try:
        await proxy.run(transport=args.transport, port=args.port)
    finally:
        watch_task.cancel()
        try:
            await watch_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    log_level = os.environ.get("LOG_LEVEL", "WARNING")
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.WARNING),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    asyncio.run(main())
