"""Folder discovery for Obsidian — called via `python -m obsidian_mcp discover`.

Walks the local vault filesystem and prints folder paths as JSON.
Supports cancellation via sentinel file.

Usage:
    python -m obsidian_mcp discover
    python -m obsidian_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import json
import os
import sys
from pathlib import Path

from permission_engine.scan_excludes import is_excluded as _is_excluded, load_excludes

VAULT_PATH = "/data/vaults"
CANCEL_FILE = "/tmp/scan-cancel"

EXCLUDES = load_excludes()


def is_excluded(name: str) -> bool:
    """Check if a folder name should be excluded. Supports wildcards like *.app."""
    return _is_excluded(name, EXCLUDES)


def discover_folders(root: str) -> list[str]:
    """Recursively walk the vault directory until no subfolders remain and return folder paths."""
    root_path = Path(root).resolve()
    if not root_path.exists():
        # Return empty — caller will handle the error
        return []

    folders: list[str] = []

    def walk(current: Path) -> None:
        if Path(CANCEL_FILE).exists():
            return
        try:
            for entry in sorted(current.iterdir()):
                if not entry.is_dir():
                    continue
                if is_excluded(entry.name):
                    continue
                if entry.name.startswith(".") and entry.name != ".trash":
                    continue
                rel = "/" + str(entry.relative_to(root_path))
                folders.append(rel)
                if entry.name != ".trash":
                    walk(entry)
        except PermissionError:
            pass

    walk(root_path)
    return folders


def main() -> None:
    parser = argparse.ArgumentParser(description="Obsidian folder discovery")
    parser.add_argument(
        "--vault",
        default=VAULT_PATH,
        help="Path to vault root (inside container)",
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

    vault_path = Path(args.vault).resolve()
    if not vault_path.exists():
        print(json.dumps({"error": f"Vault path not found: {args.vault}"}))
        sys.exit(1)

    try:
        folders = discover_folders(args.vault)
        if Path(CANCEL_FILE).exists():
            Path(CANCEL_FILE).unlink()
        print(json.dumps(folders))
    except Exception as exc:
        print(json.dumps({"error": f"Obsidian discovery failed: {exc}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
