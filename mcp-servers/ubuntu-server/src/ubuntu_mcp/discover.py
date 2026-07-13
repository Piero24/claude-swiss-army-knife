"""Folder discovery for Ubuntu Server — called via `python -m ubuntu_mcp discover`.

Walks mounted host paths under /mnt/host and prints folder paths as JSON to stdout.
No credentials needed — purely filesystem-based.

Usage:
    python -m ubuntu_mcp discover
    python -m ubuntu_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import json
import sys
from pathlib import Path

HOST_MOUNT = "/mnt/host"
CANCEL_FILE = "/tmp/scan-cancel"

# Directories under /mnt/host that are mounted (from docker-compose)
DEFAULT_ROOTS = ["home", "var/www", "var/log", "etc/nginx"]

EXCLUDES = {
    ".venv", "venv", "__pycache__", ".git", "node_modules",
    ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
    "lost+found", ".Trash", "#recycle", "@eaDir", ".env",
    ".ssh", ".gnupg", ".ssh/", ".gnupg/",
}


def discover_folders(mount_prefix: str, roots: list[str], max_depth: int = 3) -> list[str]:
    """Walk mount points and return discovered folder paths.

    Args:
        mount_prefix: Base path where host directories are mounted.
        roots: Subdirectories under mount_prefix to scan.
        max_depth: Maximum depth relative to each root.

    Returns:
        List of folder paths (e.g. ['/home/user', '/var/www/html', '/var/log/nginx']).
    """
    mount = Path(mount_prefix)
    if not mount.exists():
        print(json.dumps({"error": f"Mount path not found: {mount_prefix}"}))
        sys.exit(1)

    folders: list[str] = []

    for root in roots:
        root_path = mount / root
        if not root_path.exists():
            continue

        folders.append(f"/{root}")

        def walk(current: Path, depth: int) -> None:
            if depth > max_depth:
                return
            try:
                for entry in sorted(current.iterdir()):
                    if not entry.is_dir():
                        continue
                    if entry.name.startswith(".") or entry.name in EXCLUDES:
                        continue
                    if entry.is_symlink():
                        continue  # skip symlinks for safety
                    rel = "/" + str(entry.relative_to(mount))
                    folders.append(rel)
                    walk(entry, depth + 1)
            except PermissionError:
                pass

        walk(root_path, 1)

    return folders


def main() -> None:
    parser = argparse.ArgumentParser(description="Ubuntu folder discovery")
    parser.add_argument(
        "--mount",
        default=HOST_MOUNT,
        help="Host mount prefix",
    )
    parser.add_argument(
        "--roots",
        default=",".join(DEFAULT_ROOTS),
        help="Comma-separated roots under mount prefix",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=3,
        help="Maximum depth per root",
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

    roots_list = [r.strip() for r in args.roots.split(",") if r.strip()]
    folders = discover_folders(args.mount, roots_list, args.max_depth)
    if Path(CANCEL_FILE).exists():
        Path(CANCEL_FILE).unlink()
    print(json.dumps(folders))


if __name__ == "__main__":
    main()
