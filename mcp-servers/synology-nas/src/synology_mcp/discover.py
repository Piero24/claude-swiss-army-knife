"""Folder discovery for Synology NAS — called via `python -m synology_mcp discover`.

Reads NAS credentials from its own environment (safe — never leaves container).
Performs BFS traversal of shared folders via DSM API, prints JSON to stdout.
Supports cancellation via a sentinel file to match the web UI cancel pattern.

Usage:
    python -m synology_mcp discover
    python -m synology_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from .dsm_client import DSMClient

# Reuse scan constants from the web UI (duplicated for container independence)
DEFAULT_EXCLUDES = {
    ".venv",
    "venv",
    "__pycache__",
    ".git",
    "node_modules",
    ".next",
    ".DS_Store",
    ".pytest_cache",
    ".mypy_cache",
    "lost+found",
    ".Trash",
    "#recycle",
    "@eaDir",
    ".env",
}
CANCEL_FILE = "/tmp/scan-cancel"

SCAN_CONCURRENCY = 2
SCAN_DELAY_MS = 100


def is_excluded(name: str) -> bool:
    """Check if a folder name should be excluded."""
    return name in DEFAULT_EXCLUDES


async def discover_folders() -> list[str]:
    """BFS traversal of all shared folders on the Synology NAS.

    Returns:
        List of folder paths (e.g. ['/homes', '/homes/user', '/video']).
    """
    nas_host = os.environ.get("SYNOLOGY_NAS_HOST", "")
    nas_port = os.environ.get("SYNOLOGY_NAS_PORT", "5001")
    nas_user = os.environ.get("SYNOLOGY_NAS_USER", "")
    nas_pass = os.environ.get("SYNOLOGY_NAS_PASSWORD", "")
    base_url = f"https://{nas_host}:{nas_port}"

    if not nas_host or not nas_user or not nas_pass:
        print(json.dumps({"error": "NAS credentials not configured"}))
        sys.exit(1)

    client = DSMClient(base_url, nas_user, nas_pass)
    await client.login()

    shares = await client.list_share()

    all_folders: list[str] = []
    visited: set[str] = set()

    for share in shares:
        name = share["name"]
        if is_excluded(name):
            continue
        if name in visited:
            continue
        visited.add(name)
        all_folders.append(f"/{name}")

        # BFS: expand one level at a time
        current_level = [f"/{name}"]

        while current_level:
            # Check cancel sentinel
            if Path(CANCEL_FILE).exists():
                Path(CANCEL_FILE).unlink()
                all_folders.append("__CANCELLED__")
                return all_folders

            # List subdirectories of all folders at this level
            tasks = []
            for folder in current_level:
                if is_excluded(
                    folder.split("/")[-1] if "/" in folder else folder
                ):
                    continue
                tasks.append(_list_subdirs(client, folder))

            # Simple sequential with delay (concurrency would need semaphore)
            children_per_folder = []
            for t in tasks:
                if SCAN_DELAY_MS > 0:
                    await asyncio.sleep(SCAN_DELAY_MS / 1000)
                children_per_folder.append(await t)

            next_level: list[str] = []
            for children in children_per_folder:
                for child in children:
                    child_name = child.rsplit("/", 1)[-1]
                    if child not in visited and not is_excluded(child_name):
                        visited.add(child)
                        next_level.append(child)
                        all_folders.append(child)

            current_level = next_level

    return all_folders


async def _list_subdirs(client: DSMClient, folder_path: str) -> list[str]:
    """List subdirectories of a single folder, returning full paths."""
    try:
        entries = await client.file_list(folder_path)
        return [e["path"] for e in entries if e.get("is_dir")]
    except Exception:
        return []


def main() -> None:
    parser = argparse.ArgumentParser(description="Synology folder discovery")
    parser.add_argument(
        "--cancel",
        action="store_true",
        help="Write cancel sentinel to stop a running scan",
    )
    args = parser.parse_args()

    if args.cancel:
        Path(CANCEL_FILE).touch()
        print(json.dumps({"cancelled": True}))
        return

    folders = asyncio.run(discover_folders())
    print(json.dumps(folders))


if __name__ == "__main__":
    main()
