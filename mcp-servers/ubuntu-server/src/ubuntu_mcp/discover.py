"""Folder discovery for Ubuntu Server — called via `python -m ubuntu_mcp discover`.

In local mode: walks mounted host paths under /mnt/host.
In remote mode: uses SSH to walk the full server filesystem.

Usage:
    python -m ubuntu_mcp discover
    python -m ubuntu_mcp discover --cancel  # writes cancel sentinel
"""

import argparse
import asyncio
import json
import re
import os
import sys
from pathlib import Path

import yaml

from .host_access import create_host_access, HostAccess

CANCEL_FILE = "/tmp/scan-cancel"

# Roots for LOCAL mode (bind-mount paths in docker-compose)
LOCAL_ROOTS = ["home", "var/www", "var/log", "etc/nginx"]

# Roots for REMOTE mode (common server directories)
REMOTE_ROOTS = ["/home", "/var", "/etc", "/opt", "/srv"]

EXCLUDES = {
    ".venv", "venv", "__pycache__", ".git", "node_modules",
    ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
    "lost+found", ".Trash", "#recycle", "@eaDir",
    ".env", ".ssh", ".gnupg",
}


def discover_local(mount_prefix: str, roots: list[str], max_depth: int = 3) -> list[str]:
    """Walk mounted host paths."""
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
            if Path(CANCEL_FILE).exists():
                return
            try:
                for entry in sorted(current.iterdir()):
                    if not entry.is_dir():
                        continue
                    if entry.name.startswith(".") or entry.name in EXCLUDES:
                        continue
                    if entry.is_symlink():
                        continue
                    rel = "/" + str(entry.relative_to(mount))
                    folders.append(rel)
                    walk(entry, depth + 1)
            except PermissionError:
                pass

        walk(root_path, 1)

    return folders


async def discover_remote(backend: HostAccess, roots: list[str], max_depth: int = 3) -> list[str]:
    """Walk the server filesystem via SSH."""
    folders: list[str] = []

    async def walk(path: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = await backend.list_dir(path)
        except Exception:
            return
        for entry in entries:
            if not entry.get("is_dir"):
                continue
            name = entry["name"]
            if name.startswith(".") or name in EXCLUDES:
                continue
            full = path.rstrip("/") + "/" + name
            folders.append(full)
            await walk(full, depth + 1)

    for root in roots:
        try:
            await backend._ensure_connected()
            folders.append(root)
            await walk(root, 1)
        except Exception:
            pass

    return folders


def main() -> None:
    parser = argparse.ArgumentParser(description="Ubuntu folder discovery")
    parser.add_argument("--config", default="/app/config.yaml", help="Path to config")
    parser.add_argument("--max-depth", type=int, default=3, help="Max depth per root")
    parser.add_argument("--cancel", action="store_true", help="Write cancel sentinel")
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
        folders = asyncio.run(discover_remote(backend, REMOTE_ROOTS, args.max_depth))
    else:
        folders = discover_local(
            connection.get("local", {}).get("mount_prefix", "/mnt/host"),
            LOCAL_ROOTS,
            args.max_depth,
        )

    if Path(CANCEL_FILE).exists():
        Path(CANCEL_FILE).unlink()
    print(json.dumps(folders))


if __name__ == "__main__":
    main()
