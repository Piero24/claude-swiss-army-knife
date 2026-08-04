"""DSM 7.x API client — authentication, File Station, and System APIs."""

import base64
import hmac
import logging
import os
import struct
import time
import urllib.parse
from typing import Any, Optional

import httpx

logger = logging.getLogger("synology-mcp")


def generate_totp(secret: str) -> str:
    """Generate a TOTP code from a base32-encoded secret (RFC 6238)."""
    key = base64.b32decode(secret.upper().replace(" ", ""), casefold=True)
    counter = struct.pack(">Q", int(time.time() // 30))
    h = hmac.new(key, counter, "sha1").digest()
    offset = h[-1] & 0x0F
    code = struct.unpack(">I", h[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % 1_000_000).zfill(6)


# DSM API endpoints
API_AUTH = "/webapi/auth.cgi"
API_FILE_STATION = "/webapi/entry.cgi"
API_SYSTEM = "/webapi/entry.cgi"


class DSMClient:
    """Client for Synology DSM 7.x REST API.

    Handles authentication (session-based), request signing,
    and provides convenience methods for File Station and System APIs.

    Usage:
        client = DSMClient("https://192.168.1.100:5001", "user", "pass")
        await client.login()
        files = await client.file_list("/home")
        await client.logout()
    """

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        verify_ssl: bool = False,
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self._sid: Optional[str] = None
        self._client = httpx.AsyncClient(
            verify=verify_ssl,
            timeout=30.0,
        )

    # ── Authentication ──────────────────────────────────────────

    async def login(self) -> bool:
        """Authenticate with DSM and obtain a session ID (SID).

        If the account has OTP enabled, reads SYNOLOGY_NAS_OTP_SECRET
        from the environment and generates a TOTP code automatically.

        Returns:
            True if login succeeded.
        """
        params = {
            "api": "SYNO.API.Auth",
            "version": "7",
            "method": "login",
            "account": self.username,
            "passwd": self.password,
            "session": "FileStation",
            "format": "cookie",
        }
        resp = await self._client.get(
            f"{self.base_url}{API_AUTH}",
            params=params,
        )
        data = resp.json()

        if (
            not data.get("success")
            and isinstance(data.get("error"), dict)
            and data["error"].get("code") == 403
        ):
            errors = data["error"].get("errors", {})
            types = errors.get("types", [])
            if any(t.get("type") == "otp" for t in types):
                otp_secret = os.environ.get("SYNOLOGY_NAS_OTP_SECRET", "")
                if not otp_secret:
                    raise RuntimeError(
                        "DSM requires OTP but SYNOLOGY_NAS_OTP_SECRET is not set. "
                        "Add your TOTP secret to .env or disable 2FA for this account."
                    )
                otp_code = generate_totp(otp_secret)
                logger.info("OTP required — generated code automatically")
                params["otp_code"] = otp_code
                resp = await self._client.get(
                    f"{self.base_url}{API_AUTH}",
                    params=params,
                )
                data = resp.json()

        if not data.get("success"):
            error = data.get("error", {})
            raise RuntimeError(f"DSM login failed: {error}")

        self._sid = data["data"]["sid"]
        logger.info("DSM login successful, SID obtained")
        return True

    async def logout(self) -> None:
        """Terminate the DSM session."""
        if not self._sid:
            return
        params = {
            "api": "SYNO.API.Auth",
            "version": "7",
            "method": "logout",
            "session": "FileStation",
        }
        await self._client.get(f"{self.base_url}{API_AUTH}", params=params)
        self._sid = None

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    # ── Internal helpers ────────────────────────────────────────

    async def _require_auth(self) -> str:
        """Get the SID, logging in automatically if needed."""
        if not self._sid:
            await self.login()
        return self._sid

    async def _file_station_request(self, method: str, **params) -> dict:
        """Make a File Station API request.

        Args:
            method: The File Station API method (e.g., 'list', 'download').
            **params: Additional query parameters.

        Returns:
            Parsed JSON response data.
        """
        sid = await self._require_auth()
        # Map method to the correct DSM API name
        _API_MAP = {
            "list": "SYNO.FileStation.List",
            "list_share": "SYNO.FileStation.List",
            "getinfo": "SYNO.FileStation.List",
            "delete": "SYNO.FileStation.Delete",
            "rename": "SYNO.FileStation.Rename",
            "copymove": "SYNO.FileStation.CopyMove",
        }
        api_name = _API_MAP.get(method, "SYNO.FileStation")
        all_params = {
            "api": api_name,
            "version": "2",
            "method": method,
            "_sid": sid,
            **params,
        }
        # Always use POST to prevent WAF blocks and URL-encoding errors with wildcards/complex paths
        resp = await self._client.post(
            f"{self.base_url}{API_FILE_STATION}",
            data=all_params,
        )
        data = resp.json()
        if not data.get("success"):
            error = data.get("error", {})
            raise RuntimeError(f"File Station '{method}' failed: {error}")
        # Some APIs (delete) return success without a data payload
        return data.get("data", {})

    async def _system_request(
        self, api: str, method: str, version: str = "1", **params
    ) -> dict:
        """Make a generic DSM API request."""
        sid = await self._require_auth()
        all_params = {
            "api": api,
            "version": version,
            "method": method,
            "_sid": sid,
            **params,
        }
        resp = await self._client.get(
            f"{self.base_url}{API_SYSTEM}",
            params=all_params,
        )
        data = resp.json()
        if not data.get("success"):
            error = data.get("error", {})
            raise RuntimeError(f"API '{api}.{method}' failed: {error}")
        return data["data"]

    # ── File Station API v2 ─────────────────────────────────────

    async def file_list(self, folder_path: str, limit: int = 500) -> list[dict]:
        """List files in a shared folder.

        Args:
            folder_path: Path within a shared folder (e.g., '/home' or '/video/movies').
            limit: Maximum number of entries to return.

        Returns:
            List of file/directory entries with metadata.
        """
        data = await self._file_station_request(
            "list", folder_path=f'"{folder_path}"', limit=str(limit)
        )
        files = data.get("files", [])
        return [
            {
                "name": f["name"],
                "path": f["path"],
                "is_dir": f["isdir"],
                "size": f.get("additional", {}).get("size", 0),
                "modified": f.get("additional", {})
                .get("time", {})
                .get("mtime", ""),
            }
            for f in files
        ]

    async def file_read(self, file_path: str) -> str:
        """Read a file's contents as text via the File Station download API.

        The DSM download API returns the raw file content as the response body
        (not JSON). We use httpx.stream to capture the raw bytes without any
        content-type parsing.

        Args:
            file_path: Full path to the file.

        Returns:
            File contents as string.
        """
        sid = await self._require_auth()
        # Check if the path is a directory — downloading a folder hangs.
        # getinfo returns {"files": [file_info]}, not file_info directly.
        try:
            raw = await self._file_station_request("getinfo", path=file_path)
            files = raw.get("files", []) if isinstance(raw, dict) else []
            if files and files[0].get("isdir"):
                raise ValueError(
                    f"'{file_path}' is a directory, not a file. Use syno_file_list to browse folders."
                )
        except ValueError:
            raise
        except Exception:
            pass  # getinfo failed, try download anyway
        params = {
            "api": "SYNO.FileStation.Download",
            "version": "2",
            "method": "download",
            "path": file_path,
            "mode": "download",
            "_sid": sid,
        }
        resp = await self._client.post(
            f"{self.base_url}{API_FILE_STATION}",
            data=params,
        )
        resp.raise_for_status()
        return resp.text

    async def file_write(
        self, folder_path: str, filename: str, content: str
    ) -> dict:
        """Upload/write a file using the upload API.

        Note: The DSM File Station upload requires multipart form data.
        For simplicity, this writes to a temp location that DSM can access.

        Args:
            folder_path: Parent folder path.
            filename: Name of the file to create.
            content: File content.

        Returns:
            Result dict with written status.
        """
        sid = await self._require_auth()
        data = {
            "api": "SYNO.FileStation.Upload",
            "version": "3",
            "method": "upload",
            "path": folder_path,
            "overwrite": "true",
            "_sid": sid,
        }
        files = {
            "file": (
                filename,
                content.encode("utf-8"),
                "application/octet-stream",
            )
        }
        resp = await self._client.post(
            f"{self.base_url}{API_FILE_STATION}",
            data=data,
            files=files,
        )
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"File upload failed: {data.get('error')}")
        return {
            "written": True,
            "path": f"{folder_path.rstrip('/')}/{filename}",
        }

    async def file_delete(
        self, file_path: str, recursive: bool = False
    ) -> dict:
        """Delete a file or folder.

        Args:
            file_path: Full path to delete.
            recursive: If True, recursively delete folders.

        Returns:
            Result dict.
        """
        await self._file_station_request(
            "delete",
            path=file_path,
            recursive="true" if recursive else "false",
        )
        return {"deleted": True, "path": file_path}

    async def file_move(self, src_path: str, dst_path: str) -> dict:
        """Move/rename a file or folder.

        Uses SYNO.FileStation.Rename for same-folder renames and
        SYNO.FileStation.CopyMove for cross-folder moves.

        Args:
            src_path: Source path.
            dst_path: Destination path.

        Returns:
            Result dict.
        """
        src_dir = src_path.rsplit("/", 1)[0] if "/" in src_path else ""
        dst_dir = dst_path.rsplit("/", 1)[0] if "/" in dst_path else ""
        dst_name = dst_path.rsplit("/", 1)[-1] if "/" in dst_path else dst_path

        if src_dir == dst_dir:
            # Same folder — simple rename
            await self._file_station_request(
                "rename", path=src_path, name=dst_name
            )
        else:
            # Cross-folder move — use CopyMove API
            await self._file_station_request(
                "copymove",
                path=src_path,
                dest_folder_path=dst_dir,
                remove_src="true",
            )
        return {"moved": True, "src": src_path, "dst": dst_path}

    async def file_search(
        self, query: str, folder_path: str = "/"
    ) -> list[dict]:
        """Search for files by name.

        Args:
            query: Search query (name pattern).
            folder_path: Folder to search within.

        Returns:
            List of matching file entries.
        """
        # folder_path needs quotes (spaces in share names), pattern is raw glob
        pattern = query if any(c in query for c in "*?") else f"*{query}*"
        data = await self._file_station_request(
            "list", folder_path=f'"{folder_path}"', pattern=pattern
        )
        return [
            {"name": f["name"], "path": f["path"], "is_dir": f["isdir"]}
            for f in data.get("files", [])
        ]

    # ── System Info APIs ────────────────────────────────────────

    async def system_info(self) -> dict:
        """Get NAS system information: model, DSM version, CPU, RAM."""
        data = await self._system_request(
            "SYNO.Core.System", "info", version="1"
        )

        def _safe_num(val, default=0):
            try:
                return float(val) if "." in str(val) else int(val)
            except (ValueError, TypeError):
                return default

        return {
            "model": data.get("model", "unknown"),
            "dsm_version": data.get(
                "version_string", data.get("firmware_ver", "unknown")
            ),
            "serial": data.get("serial", "unknown"),
            "cpu_cores": _safe_num(
                data.get("cpu_cores", data.get("cpu_num", 0))
            ),
            "ram_mb": _safe_num(
                data.get("ram_mb", data.get("ram", data.get("memory", 0)))
            ),
            "temperature": _safe_num(
                data.get("temperature", data.get("sys_temp", 0))
            ),
            "uptime_seconds": _safe_num(
                data.get("uptime_seconds", data.get("uptime", 0))
            ),
        }

    async def storage_info(self) -> list[dict]:
        """Get storage pool and volume information."""
        data = await self._system_request(
            "SYNO.Storage.CGI.Storage", "load_info", version="1"
        )
        volumes = data.get("volumes", [])

        def _safe_bytes(val) -> float:
            try:
                return float(val)
            except (ValueError, TypeError):
                return 0.0

        res = []
        for v in volumes:
            size_obj = v.get("size", {})
            if isinstance(size_obj, dict):
                total_b = _safe_bytes(size_obj.get("total", 0))
                used_b = _safe_bytes(size_obj.get("used", 0))
            else:
                total_b = _safe_bytes(size_obj)
                used_b = _safe_bytes(v.get("used", 0))

            res.append(
                {
                    "name": v.get("display_name", v.get("uuid", "?")),
                    "size_gb": round(total_b / (1024**3), 1),
                    "used_gb": round(used_b / (1024**3), 1),
                    "status": v.get("status", "unknown"),
                    "file_system": v.get("fs_type", "unknown"),
                }
            )
        return res

    # ── Share Discovery ─────────────────────────────────────────

    async def list_share(self) -> list[dict]:
        """List all shared folders on the NAS.

        Returns:
            List of shared folder dicts with name, description, and path.
        """
        sid = await self._require_auth()
        params = {
            "api": "SYNO.FileStation.List",
            "version": "2",
            "method": "list_share",
            "_sid": sid,
        }
        resp = await self._client.get(
            f"{self.base_url}{API_FILE_STATION}",
            params=params,
        )
        data = resp.json()
        if not data.get("success"):
            error = data.get("error", {})
            raise RuntimeError(f"list_share failed: {error}")
        return [
            {"name": s["name"], "path": f"/{s['name']}"}
            for s in data["data"].get("shares", [])
        ]
