"""Folder discovery for Obsidian — called via `python -m obsidian_mcp discover`.

Walks the vault filesystem at /data/vaults and prints folder paths as JSON to stdout.
No credentials needed — purely filesystem-based.

Usage:
    python -m obsidian_mcp discover
    python -m obsidian_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import json
import os
import sys
from pathlib import Path

VAULT_PATH = "/data/vaults"
CANCEL_FILE = "/tmp/scan-cancel"

EXCLUDES = {
    ".obsidian", ".git", ".trash", ".venv", "venv", "__pycache__",
    "node_modules", ".DS_Store", ".pytest_cache", ".mypy_cache",
}


def discover_folders(root: str, max_depth: int = 5) -> list[str]:
    """Recursively walk the vault directory and return folder paths.

    Args:
        root: Root directory to scan.
        max_depth: Maximum depth relative to root.

    Returns:
        List of relative folder paths (e.g. ['/personal', '/personal/private', '/work']).
    """
    root_path = Path(root).resolve()
    if not root_path.exists():
        print(json.dumps({"error": f"Vault path not found: {root}"}))
        sys.exit(1)

    folders: list[str] = []

    def walk(current: Path, depth: int) -> None:
        if depth > max_depth:
            return
        if Path(CANCEL_FILE).exists():
            return
        try:
            for entry in sorted(current.iterdir()):
                if not entry.is_dir():
                    continue
                if entry.name.startswith(".") and entry.name not in (".trash",):
                    continue
                if entry.name in EXCLUDES:
                    continue
                rel = "/" + str(entry.relative_to(root_path))
                folders.append(rel)
                # Don't recurse into .trash
                if entry.name != ".trash":
                    walk(entry, depth + 1)
        except PermissionError:
            pass

    walk(root_path, 0)
    return folders


def main() -> None:
    parser = argparse.ArgumentParser(description="Obsidian folder discovery")
    parser.add_argument(
        "--vault",
        default=os.environ.get("OBSIDIAN_VAULT_PATH", VAULT_PATH),
        help="Path to vault root",
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

    folders = discover_folders(args.vault)
    # Clean up cancel file after successful scan
    if Path(CANCEL_FILE).exists():
        Path(CANCEL_FILE).unlink()
    print(json.dumps(folders))


if __name__ == "__main__":
    main()
