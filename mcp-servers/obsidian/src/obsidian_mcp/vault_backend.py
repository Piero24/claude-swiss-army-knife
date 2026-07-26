"""Vault backends — local filesystem, remote SSH/SFTP, and CouchDB LiveSync."""

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("obsidian-mcp")


class VaultBackend:
    """Abstract interface for vault operations. All methods are sync (local)
    or async (remote/LiveSync) depending on the backend."""

    async def read_note(self, relative_path: str) -> str: ...

    async def write_note(self, relative_path: str, content: str) -> Path: ...

    async def delete_note(
        self, relative_path: str, permanent: bool = False
    ) -> dict: ...

    async def list_vault(
        self, subfolder: str = "", depth: int = 3
    ) -> list[dict]: ...

    async def note_exists(self, relative_path: str) -> bool: ...

    async def get_all_notes(self) -> list[Path]: ...

    @property
    def root(self) -> Path:
        """Path-like root for ripgrep and backlink scanning."""
        ...


# ── Local filesystem backend ──────────────────────────

from .vault import Vault  # noqa: E402


class LocalVaultBackend(VaultBackend):
    """Direct filesystem access — wraps the existing Vault class."""

    def __init__(self, vault_path: str):
        self._vault = Vault(vault_path)

    @property
    def root(self) -> Path:
        return self._vault.root

    async def read_note(self, relative_path: str) -> str:
        return self._vault.read_note(relative_path)

    async def write_note(self, relative_path: str, content: str) -> Path:
        return self._vault.write_note(relative_path, content)

    async def delete_note(
        self, relative_path: str, permanent: bool = False
    ) -> dict:
        return self._vault.delete_note(relative_path, permanent)

    async def list_vault(
        self, subfolder: str = "", depth: int = 3
    ) -> list[dict]:
        return self._vault.list_vault(subfolder, depth)

    async def note_exists(self, relative_path: str) -> bool:
        return self._vault.note_exists(relative_path)

    async def get_all_notes(self) -> list[Path]:
        return self._vault.get_all_notes()


# ── Remote SSH/SFTP backend ────────────────────────────


class RemoteVaultBackend(VaultBackend):
    """SSH/SFTP access to a vault on a remote server."""

    def __init__(self, host: str, port: int, user: str, key_data: str, vault_path: str):
        self._host = host
        self._port = port
        self._user = user
        self._vault_path = Path(vault_path)
        self._key_data = key_data  # file path or inline key content
        self._conn = None
        self._sftp = None

    def _resolve_key_path(self) -> str:
        """If key_data looks like a key (contains BEGIN), write to temp file."""
        if "BEGIN" in self._key_data and "\n" in self._key_data:
            import tempfile
            tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False)
            tmp.write(self._key_data)
            tmp.close()
            return tmp.name
        return self._key_data

    @property
    def root(self) -> Path:
        return self._vault_path

    async def _ensure_connected(self):
        if self._sftp is not None:
            return
        try:
            import asyncssh
        except ImportError:
            raise RuntimeError(
                "asyncssh is required for remote vault access. "
                "Install it with: pip install asyncssh"
            )
        self._conn = await asyncssh.connect(
            self._host,
            port=self._port,
            username=self._user,
            client_keys=[self._resolve_key_path()],
            known_hosts=None,
        )
        self._sftp = await self._conn.start_sftp_client()
        logger.info("Connected to %s:%d", self._host, self._port)

    def _remote_path(self, relative: str) -> str:
        clean = relative.lstrip("/")
        return str(self._vault_path / clean)

    async def read_note(self, relative_path: str) -> str:
        await self._ensure_connected()
        remote = self._remote_path(relative_path)
        try:
            async with self._sftp.open(remote, "r") as f:
                return (await f.read()).decode("utf-8")
        except FileNotFoundError:
            # Try with .md extension
            md_remote = self._remote_path(relative_path + ".md")
            async with self._sftp.open(md_remote, "r") as f:
                return (await f.read()).decode("utf-8")

    async def write_note(self, relative_path: str, content: str) -> Path:
        await self._ensure_connected()
        remote = self._remote_path(relative_path)
        if not remote.endswith(".md"):
            remote += ".md"
        # Ensure parent directory exists
        parent = str(Path(remote).parent)
        try:
            await self._sftp.makedirs(parent)
        except Exception:
            pass
        async with self._sftp.open(remote, "w") as f:
            await f.write(content.encode("utf-8"))
        return Path(remote)

    async def delete_note(
        self, relative_path: str, permanent: bool = False
    ) -> dict:
        await self._ensure_connected()
        remote = self._remote_path(relative_path)
        if not remote.endswith(".md"):
            remote += ".md"
        if permanent:
            await self._sftp.remove(remote)
            return {"deleted": True, "path": relative_path, "trashed": False}
        # Soft delete: move to .trash/
        trash_dir = str(self._vault_path / ".trash")
        try:
            await self._sftp.makedirs(trash_dir)
        except Exception:
            pass
        name = Path(remote).name
        trash_path = f"{trash_dir}/{name}"
        await self._sftp.rename(remote, trash_path)
        return {
            "deleted": True,
            "path": relative_path,
            "trashed": True,
            "trash_path": trash_path,
        }

    async def list_vault(
        self, subfolder: str = "", depth: int = 3
    ) -> list[dict]:
        await self._ensure_connected()
        base = (self._vault_path / subfolder.lstrip("/")) if subfolder else self._vault_path
        entries = []
        await self._walk_remote(str(base), entries, max_depth=depth, current_depth=1)
        return entries

    async def _walk_remote(self, directory: str, entries: list, max_depth: int, current_depth: int):
        if current_depth > max_depth:
            return
        try:
            async for entry in self._sftp.listdir(directory):
                if entry.startswith(".") and entry != ".trash":
                    continue
                full = f"{directory}/{entry}"
                stat = await self._sftp.stat(full)
                entries.append({
                    "name": entry,
                    "path": str(Path(full).relative_to(self._vault_path)),
                    "is_dir": stat.is_dir,
                    "size": stat.size if not stat.is_dir else 0,
                    "modified": datetime.fromtimestamp(stat.mtime).isoformat(),
                })
                if stat.is_dir and current_depth < max_depth:
                    await self._walk_remote(full, entries, max_depth, current_depth + 1)
        except Exception:
            pass

    async def note_exists(self, relative_path: str) -> bool:
        await self._ensure_connected()
        remote = self._remote_path(relative_path)
        try:
            await self._sftp.stat(remote)
            return True
        except Exception:
            try:
                await self._sftp.stat(remote + ".md")
                return True
            except Exception:
                return False

    async def get_all_notes(self) -> list[Path]:
        await self._ensure_connected()
        notes = []
        await self._collect_notes(str(self._vault_path), notes)
        return notes

    async def _collect_notes(self, directory: str, notes: list):
        try:
            async for entry in self._sftp.listdir(directory):
                if entry.startswith("."):
                    continue
                full = f"{directory}/{entry}"
                stat = await self._sftp.stat(full)
                if stat.is_dir:
                    await self._collect_notes(full, notes)
                elif entry.endswith(".md"):
                    notes.append(Path(full))
        except Exception:
            pass


# ── Factory ────────────────────────────────────────────


def create_backend(config: dict) -> VaultBackend:
    """Create the appropriate vault backend from config."""
    connection = config.get("connection", {})
    mode = connection.get("mode", "local")

    if mode == "remote":
        remote = connection.get("remote", {})
        key_data = remote.get("key", "") or remote.get("key_path", "")
        return RemoteVaultBackend(
            host=remote.get("host", ""),
            port=remote.get("port", 22),
            user=remote.get("user", ""),
            key_data=key_data,
            vault_path=remote.get("vault_path", ""),
        )

    # Default: local
    local = connection.get("local", {})
    vault_path = local.get("vault_path", "/data/vaults")
    return LocalVaultBackend(vault_path)
