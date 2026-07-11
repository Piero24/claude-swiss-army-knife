"""DSM 7.x API client — authentication, File Station, and System APIs."""

import logging
import os
import urllib.parse
from typing import Any, Optional

import httpx

logger = logging.getLogger("synology-mcp")

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

    def __init__(self, base_url: str, username: str, password: str,
                 verify_ssl: bool = False):
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

    def _require_auth(self) -> str:
        """Get the SID, raising if not authenticated."""
        if not self._sid:
            raise RuntimeError("Not authenticated. Call login() first.")
        return self._sid

    async def _file_station_request(self, method: str, **params) -> dict:
        """Make a File Station API request.

        Args:
            method: The File Station API method (e.g., 'list', 'download').
            **params: Additional query parameters.

        Returns:
            Parsed JSON response data.
        """
        sid = self._require_auth()
        all_params = {
            "api": "SYNO.FileStation",
            "version": "2",
            "method": method,
            "_sid": sid,
            **params,
        }
        resp = await self._client.get(
            f"{self.base_url}{API_FILE_STATION}",
            params=all_params,
        )
        data = resp.json()
        if not data.get("success"):
            error = data.get("error", {})
            raise RuntimeError(f"File Station '{method}' failed: {error}")
        return data["data"]

    async def _system_request(self, api: str, method: str, version: str = "1",
                               **params) -> dict:
        """Make a generic DSM API request."""
        sid = self._require_auth()
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
        data = await self._file_station_request("list", folder_path=f'"{folder_path}"', limit=str(limit))
        files = data.get("files", [])
        return [
            {
                "name": f["name"],
                "path": f["path"],
                "is_dir": f["isdir"],
                "size": f.get("additional", {}).get("size", 0),
                "modified": f.get("additional", {}).get("time", {}).get("mtime", ""),
            }
            for f in files
        ]

    async def file_read(self, file_path: str) -> str:
        """Read a file's contents as text.

        Uses the download method with inline content retrieval.

        Args:
            file_path: Full path to the file.

        Returns:
            File contents as string.
        """
        sid = self._require_auth()
        params = {
            "api": "SYNO.FileStation",
            "version": "2",
            "method": "download",
            "path": f'"{file_path}"',
            "mode": "open",
            "_sid": sid,
        }
        resp = await self._client.get(
            f"{self.base_url}{API_FILE_STATION}",
            params=params,
        )
        return resp.text

    async def file_write(self, folder_path: str, filename: str,
                         content: str) -> dict:
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
        sid = self._require_auth()
        # Use the upload method with file content
        files = {"file": (filename, content.encode("utf-8"), "application/octet-stream")}
        params = {
            "api": "SYNO.FileStation",
            "version": "2",
            "method": "upload",
            "path": f'"{folder_path}"',
            "overwrite": "true",
            "_sid": sid,
        }
        resp = await self._client.post(
            f"{self.base_url}{API_FILE_STATION}",
            params=params,
            files=files,
        )
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"File upload failed: {data.get('error')}")
        return {"written": True, "path": f"{folder_path.rstrip('/')}/{filename}"}

    async def file_delete(self, file_path: str, recursive: bool = False) -> dict:
        """Delete a file or folder.

        Args:
            file_path: Full path to delete.
            recursive: If True, recursively delete folders.

        Returns:
            Result dict.
        """
        await _file_station_request("delete", path=f'"{file_path}"',
                                     recursive="true" if recursive else "false")
        return {"deleted": True, "path": file_path}

    async def file_move(self, src_path: str, dst_path: str) -> dict:
        """Move/rename a file or folder.

        Args:
            src_path: Source path.
            dst_path: Destination path.

        Returns:
            Result dict.
        """
        await _file_station_request("rename", path=f'"{src_path}"', name=f'"{dst_path}"')
        return {"moved": True, "src": src_path, "dst": dst_path}

    async def file_search(self, query: str, folder_path: str = "/") -> list[dict]:
        """Search for files by name.

        Args:
            query: Search query (name pattern).
            folder_path: Folder to search within.

        Returns:
            List of matching file entries.
        """
        data = await self._file_station_request("list", folder_path=f'"{folder_path}"',
                                            pattern=f'"{query}"')
        return [
            {"name": f["name"], "path": f["path"], "is_dir": f["isdir"]}
            for f in data.get("files", [])
        ]

    # ── System Info APIs ────────────────────────────────────────

    async def system_info(self) -> dict:
        """Get NAS system information: model, DSM version, CPU, RAM."""
        data = await self._system_request("SYNO.Core.System", "info", version="1")
        return {
            "model": data.get("model", "unknown"),
            "dsm_version": data.get("version_string", "unknown"),
            "serial": data.get("serial", "unknown"),
            "cpu_cores": data.get("cpu_num", 0),
            "ram_mb": data.get("memory", 0),
            "temperature": data.get("temperature", 0),
            "uptime_seconds": data.get("uptime", 0),
        }

    async def storage_info(self) -> list[dict]:
        """Get storage pool and volume information."""
        data = await self._system_request("SYNO.Storage.CGI.Storage", "load_info", version="1")
        volumes = data.get("volumes", [])
        return [
            {
                "name": v.get("display_name", v.get("uuid", "?")),
                "size_gb": round(v.get("size", {}).get("total", 0) / (1024**3), 1),
                "used_gb": round(v.get("size", {}).get("used", 0) / (1024**3), 1),
                "status": v.get("status", "unknown"),
                "file_system": v.get("fs_type", "unknown"),
            }
            for v in volumes
        ]
