"""Folder discovery for Obsidian — called via `python -m obsidian_mcp discover`.

Walks the vault (local or remote) and prints folder paths as JSON.
Supports cancellation via sentinel file.

Usage:
    python -m obsidian_mcp discover
    python -m obsidian_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import yaml

from .vault_backend import VaultBackend, create_backend

CANCEL_FILE = "/tmp/scan-cancel"

EXCLUDES = {
    ".obsidian",
    ".git",
    ".trash",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    ".DS_Store",
    ".pytest_cache",
    ".mypy_cache",
}


def _extract_folders(entries: list[dict]) -> list[str]:
    """Extract unique folder paths from vault entries."""
    folders: set[str] = set()
    for entry in entries:
        if entry.get("is_dir"):
            name = entry["name"]
            if name in EXCLUDES or name.startswith("."):
                continue
            p = entry["path"]
            folders.add(p if p.startswith("/") else "/" + p)
        # Also collect parent dirs
        p = entry["path"]
        parent = str(Path(p).parent)
        if parent and parent != ".":
            folders.add("/" + parent.lstrip("/"))
    return sorted(folders)


async def discover_via_backend(backend: VaultBackend) -> list[str]:
    """Discover folders using the backend's list_vault method."""
    entries = await backend.list_vault("", depth=5)
    return _extract_folders(entries)


def discover_local(vault_path: str) -> list[str]:
    """Recursively walk a local vault directory."""
    root_path = Path(vault_path).resolve()
    if not root_path.exists():
        print(json.dumps({"error": f"Vault path not found: {vault_path}"}))
        sys.exit(1)

    folders: list[str] = []

    def walk(current: Path, depth: int) -> None:
        if depth > 5:
            return
        if Path(CANCEL_FILE).exists():
            return
        try:
            for entry in sorted(current.iterdir()):
                if not entry.is_dir():
                    continue
                if entry.name.startswith(".") and entry.name != ".trash":
                    continue
                if entry.name in EXCLUDES:
                    continue
                rel = "/" + str(entry.relative_to(root_path))
                folders.append(rel)
                if entry.name != ".trash":
                    walk(entry, depth + 1)
        except PermissionError:
            pass

    walk(root_path, 0)
    return folders


def main() -> None:
    parser = argparse.ArgumentParser(description="Obsidian folder discovery")
    parser.add_argument(
        "--config",
        default="/app/config.yaml",
        help="Path to obsidian.yaml config",
    )
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

    # Read config to determine connection mode
    config = {}
    try:
        with open(args.config, "r") as f:
            config = yaml.safe_load(f) or {}
    except Exception:
        pass

    connection = config.get("connection", {})
    mode = connection.get("mode", "local")

    if mode == "local":
        vault_path = connection.get("local", {}).get(
            "vault_path",
            os.environ.get("OBSIDIAN_VAULT_PATH", "/data/vaults"),
        )
        folders = discover_local(vault_path)
    else:
        backend = create_backend(config)
        folders = asyncio.run(discover_via_backend(backend))

    if Path(CANCEL_FILE).exists():
        Path(CANCEL_FILE).unlink()
    print(json.dumps(folders))


if __name__ == "__main__":
    main()
