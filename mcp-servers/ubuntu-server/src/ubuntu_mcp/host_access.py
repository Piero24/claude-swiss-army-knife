"""Host access — local (bind-mount) and remote (SSH) backends."""

import asyncio
import logging
from pathlib import Path

logger = logging.getLogger("ubuntu-mcp")


class HostAccess:
    """Abstract interface for host filesystem and command access."""

    def read_file(self, path: str) -> str:
        ...

    async def write_file(self, path: str, content: str) -> None:
        ...

    async def list_dir(self, path: str) -> list[dict]:
        ...

    async def run_command(self, cmd: str, timeout: int = 30) -> dict:
        ...

    def host_path(self, path: str) -> str:
        ...

    def container_path(self, path: str) -> Path:
        ...


# ── Local (bind-mount) access ─────────────────────────


class LocalHostAccess(HostAccess):
    """Direct filesystem access via Docker bind mounts (/mnt/host)."""

    def __init__(self, mount_prefix: str = "/mnt/host"):
        self._mount = Path(mount_prefix)

    def host_path(self, path: str) -> str:
        return path

    def container_path(self, path: str) -> Path:
        clean = path.lstrip("/")
        return (self._mount / clean).resolve(strict=False)

    def read_file(self, path: str) -> str:
        cp = self.container_path(path)
        try:
            return cp.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return cp.read_text(encoding="latin-1")

    async def write_file(self, path: str, content: str) -> None:
        cp = self.container_path(path)
        cp.parent.mkdir(parents=True, exist_ok=True)
        cp.write_text(content, encoding="utf-8")

    async def list_dir(self, path: str) -> list[dict]:
        cp = self.container_path(path)
        if not cp.exists() or not cp.is_dir():
            return []
        entries = []
        for entry in sorted(cp.iterdir()):
            try:
                st = entry.stat()
                entries.append(
                    {
                        "name": entry.name,
                        "path": str(entry),
                        "is_dir": entry.is_dir(),
                        "size": st.st_size if entry.is_file() else 0,
                        "modified": st.st_mtime,
                    }
                )
            except OSError:
                pass
        return entries

    async def run_command(self, cmd: str, timeout: int = 30) -> dict:
        # Run on host via Docker-based nsenter (uses Docker socket, not /proc)
        escaped = cmd.replace("'", "'\\''")
        full_cmd = (
            "docker run --rm --pid=host --privileged "
            f"alpine:latest nsenter -t 1 -m -- /bin/sh -c '{escaped}'"
        )
        return await self._exec(full_cmd, timeout)

    async def run_host_command(self, cmd: str, timeout: int = 30) -> dict:
        """Run a command without nsenter (for Docker CLI which uses socket)."""
        return await self._exec(cmd, timeout)

    async def _exec(self, cmd: str, timeout: int) -> dict:
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            return {
                "stdout": stdout.decode("utf-8", errors="replace"),
                "stderr": stderr.decode("utf-8", errors="replace"),
                "exit_code": proc.returncode or 0,
            }
        except asyncio.TimeoutError:
            return {
                "stdout": "",
                "stderr": "Command timed out",
                "exit_code": -1,
            }


# ── Remote (SSH) access ───────────────────────────────


class RemoteHostAccess(HostAccess):
    """SSH access to a remote Linux server via asyncssh."""

    def __init__(self, host: str, port: int, user: str, key_data: str):
        self._host = host
        self._port = port
        self._user = user
        self._key_data = key_data
        self._conn = None
        self._sftp = None

    def _resolve_key(self) -> str:
        import os as _os
        import tempfile

        data = self._key_data
        if _os.path.isfile(data):
            return data
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False)
        tmp.write(data)
        tmp.close()
        _os.chmod(tmp.name, 0o600)
        return tmp.name

    async def _ensure_connected(self):
        if self._conn is not None:
            return
        import asyncssh

        self._conn = await asyncssh.connect(
            self._host,
            port=self._port,
            username=self._user,
            client_keys=[self._resolve_key()],
            known_hosts=None,
        )
        self._sftp = await self._conn.start_sftp_client()

    def host_path(self, path: str) -> str:
        return path

    def container_path(self, path: str) -> Path:
        return Path(path)

    def read_file(self, path: str) -> str:
        raise RuntimeError("Use async read_file_remote for SSH")

    async def read_file_async(self, path: str) -> str:
        await self._ensure_connected()
        try:
            async with self._sftp.open(path, "r") as f:
                return (await f.read()).decode("utf-8")
        except UnicodeDecodeError:
            async with self._sftp.open(path, "r") as f:
                return (await f.read()).decode("latin-1")

    async def write_file(self, path: str, content: str) -> None:
        await self._ensure_connected()
        parent = str(Path(path).parent)
        try:
            await self._sftp.makedirs(parent)
        except Exception:
            pass
        async with self._sftp.open(path, "w") as f:
            await f.write(content.encode("utf-8"))

    async def list_dir(self, path: str) -> list[dict]:
        await self._ensure_connected()
        entries = []
        try:
            names = await self._sftp.listdir(path)
            for name in names:
                if name in (".", ".."):
                    continue
                full = path.rstrip("/") + "/" + name
                try:
                    st = await self._sftp.stat(full)
                except Exception:
                    continue
                # SFTPAttrs: use stat to check type (S_IFDIR = 0o040000)
                import stat as _stat

                mode = st.permissions if hasattr(st, "permissions") else 0
                is_dir = (
                    _stat.S_ISDIR(mode)
                    if mode
                    else bool(st.size == 4096 and not name.startswith("."))
                )
                entries.append(
                    {
                        "name": name,
                        "path": full,
                        "is_dir": is_dir,
                        "size": st.size if hasattr(st, "size") else 0,
                        "modified": st.mtime if hasattr(st, "mtime") else 0,
                    }
                )
        except Exception:
            pass
        return entries

    async def run_command(self, cmd: str, timeout: int = 30) -> dict:
        await self._ensure_connected()
        try:
            result = await asyncio.wait_for(
                self._conn.run(cmd), timeout=timeout
            )
            return {
                "stdout": result.stdout or "",
                "stderr": result.stderr or "",
                "exit_code": result.exit_status or 0,
            }
        except asyncio.TimeoutError:
            return {
                "stdout": "",
                "stderr": "Command timed out",
                "exit_code": -1,
            }

    async def run_host_command(self, cmd: str, timeout: int = 30) -> dict:
        """Same as run_command — already on the host via SSH."""
        return await self.run_command(cmd, timeout)


# ── Factory ────────────────────────────────────────────


def create_host_access(config: dict | None = None) -> HostAccess:
    """Create the appropriate host access backend from config."""
    connection = config.get("connection", {}) if config else {}
    mode = connection.get("mode", "local")

    if mode == "remote":
        remote = connection.get("remote", {})
        key_data = remote.get("key", "") or remote.get(
            "key_path", "/app/keys/ssh_key"
        )
        return RemoteHostAccess(
            host=remote.get("host", ""),
            port=remote.get("port", 22),
            user=remote.get("user", ""),
            key_data=key_data,
        )

    return LocalHostAccess(
        mount_prefix=connection.get("local", {}).get(
            "mount_prefix", "/mnt/host"
        ),
    )
