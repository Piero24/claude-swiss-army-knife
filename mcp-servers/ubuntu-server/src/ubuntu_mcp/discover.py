"""Folder discovery for Ubuntu Server — called via `python -m ubuntu_mcp discover`.

In local mode: walks mounted host paths under /mnt/host (BFS, unlimited depth).
In remote mode: uses SSH to walk the full server filesystem (BFS, unlimited depth).

Respects exclude patterns from the web UI settings.

Usage:
    python -m ubuntu_mcp discover
    python -m ubuntu_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

import yaml

from .host_access import create_host_access, HostAccess

CANCEL_FILE = "/tmp/scan-cancel"

# Roots for LOCAL mode (bind-mount paths in docker-compose)
LOCAL_ROOTS = ["home", "var/www", "var/log", "etc/nginx"]

# Roots for REMOTE mode (common server directories)
REMOTE_ROOTS = [
    "/home",
    "/var/www",
    "/var/log",
    "/opt",
    "/srv",
    "/DATA",
    "/ROMS",
    "/etc/nginx",
]

# These are also excluded by the web UI, but kept as fallback
EXCLUDES = {
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
    ".ssh",
    ".gnupg",
}


def _name_from_path(p: str) -> str:
    return p.split("/").filter(None).pop() or p


def is_excluded(name: str) -> bool:
    """Check if a folder name should be excluded. Supports wildcard patterns."""
    for pat in EXCLUDES:
        if pat.startswith("*."):
            if name.endswith(pat[1:]):
                return True
        elif name == pat:
            return True
    return False


def discover_local(mount_prefix: str, roots: list[str]) -> list[str]:
    """BFS walk of mounted host paths — no depth limit."""
    mount = Path(mount_prefix)
    if not mount.exists():
        print(json.dumps({"error": f"Mount path not found: {mount_prefix}"}))
        sys.exit(1)

    all_folders: list[str] = []

    for root in roots:
        root_path = mount / root
        if not root_path.exists():
            continue
        all_folders.append(f"/{root}")
        current_level = [root_path]

        while current_level:
            if Path(CANCEL_FILE).exists():
                return all_folders

            next_level: list[Path] = []
            for directory in current_level:
                try:
                    for entry in sorted(directory.iterdir()):
                        if not entry.is_dir():
                            continue
                        name = entry.name
                        if name.startswith(".") or is_excluded(name):
                            continue
                        if entry.is_symlink():
                            continue
                        rel = "/" + str(entry.relative_to(mount))
                        all_folders.append(rel)
                        next_level.append(entry)
                except PermissionError:
                    pass
            current_level = next_level

    return all_folders


async def discover_remote(
    backend: HostAccess, roots: list[str], max_depth: int = 5
) -> list[str]:
    """BFS walk of remote server filesystem via SSH."""
    all_folders: list[str] = []

    async def list_dir_safe(path: str) -> list[dict]:
        try:
            return await backend.list_dir(path)
        except Exception:
            return []

    for root in roots:
        all_folders.append(root)
        current_level = [root]
        depth = 1

        while current_level and depth < max_depth:
            next_level: list[str] = []
            for directory in current_level:
                entries = await list_dir_safe(directory)
                for entry in entries:
                    if not entry.get("is_dir"):
                        continue
                    name = entry["name"]
                    if name.startswith(".") or is_excluded(name):
                        continue
                    full = directory.rstrip("/") + "/" + name
                    all_folders.append(full)
                    next_level.append(full)
            current_level = next_level
            depth += 1

    return all_folders


def main() -> None:
    parser = argparse.ArgumentParser(description="Ubuntu folder discovery")
    parser.add_argument(
        "--config", default="/app/config.yaml", help="Path to config"
    )
    parser.add_argument(
        "--max-depth", type=int, default=6, help="Max depth for remote scan"
    )
    parser.add_argument(
        "--cancel", action="store_true", help="Write cancel sentinel"
    )
    args = parser.parse_args()

    if args.cancel:
        Path(CANCEL_FILE).touch()
        print(json.dumps({"cancelled": True}))
        return

    # Read config with env var substitution
    config = {}
    try:
        with open(args.config, "r") as f:
            raw = f.read()

        def _sub(m):
            var, _, default = m.group(1).partition(":-")
            return os.environ.get(var, default) or default

        raw = re.sub(r"\$\{([^}]+)\}", _sub, raw)
        config = yaml.safe_load(raw) or {}
    except Exception:
        pass

    connection = config.get("connection", {})
    mode = connection.get("mode", "local")

    if mode == "remote":
        backend = create_host_access(config)
        folders = asyncio.run(discover_remote(backend, REMOTE_ROOTS))
    else:
        folders = discover_local(
            connection.get("local", {}).get("mount_prefix", "/mnt/host"),
            LOCAL_ROOTS,
        )

    if Path(CANCEL_FILE).exists():
        Path(CANCEL_FILE).unlink()
    print(json.dumps(folders))


if __name__ == "__main__":
    main()
