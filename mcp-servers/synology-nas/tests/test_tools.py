"""Unit tests for synology MCP tool handlers with mocked DSM client."""

import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import yaml


@pytest.fixture
def mock_dsm():
    """Return a MagicMock that behaves like DSMClient."""
    dsm = MagicMock()
    dsm.file_list = AsyncMock(
        return_value=[
            {
                "name": "doc.pdf",
                "path": "/home/doc.pdf",
                "isdir": False,
                "size": 1024,
            },
        ]
    )
    dsm.file_read = AsyncMock(return_value="file content from NAS")
    dsm.file_write = AsyncMock(return_value={"success": True})
    dsm.file_delete = AsyncMock(return_value={"success": True})
    dsm.file_move = AsyncMock(return_value={"success": True})
    dsm.file_search = AsyncMock(
        return_value=[
            {"name": "found.txt", "path": "/home/found.txt"},
        ]
    )
    dsm.system_info = AsyncMock(
        return_value={"model": "DS920+", "version": "DSM 7.2"}
    )
    dsm.storage_info = AsyncMock(
        return_value={"volumes": [{"name": "volume1", "size": 1000}]}
    )
    dsm.list_share = AsyncMock(
        return_value=[{"name": "home", "path": "/volume1/home"}]
    )
    dsm.login = AsyncMock(return_value=True)
    dsm.logout = AsyncMock()
    dsm.close = AsyncMock()
    return dsm


@pytest.fixture
def synology_config():
    return {
        "server": {
            "name": "synology-nas",
            "log_level": "INFO",
            "audit_log": "/dev/null",
        },
        "permissions": {
            "default_access": "none",
            "paths": [
                {"path": "/home/**", "access": "write", "id": "home_rw"},
            ],
            "commands": [],
            "default_command_access": "none",
        },
    }


@pytest.fixture
def synology_server(synology_config, mock_dsm):
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as f:
        yaml.dump(synology_config, f)
        config_path = f.name

    from synology_mcp.server import SynologyServer

    server = SynologyServer.__new__(SynologyServer)
    server._config_path = config_path
    server.dsm = mock_dsm

    # Initialize base class manually
    from permission_engine import BaseMCPServer, PermissionEnforcer

    BaseMCPServer.__init__(server, "synology-mcp", config_path)

    return server


class TestFileList:

    async def test_file_list(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_list", {"folder_path": "/home"}
        )
        assert result["count"] == 1

    async def test_file_list_with_limit(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_list", {"folder_path": "/home", "limit": 10}
        )
        assert result["count"] == 1


class TestFileRead:

    async def test_file_read(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_read", {"file_path": "/home/doc.pdf"}
        )
        assert "file content from NAS" in result["content"]


class TestFileWrite:

    async def test_file_write(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_write",
            {
                "folder_path": "/home",
                "filename": "new.txt",
                "content": "hello",
            },
        )
        assert result is not None


class TestFileDelete:

    async def test_file_delete(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_delete", {"file_path": "/home/doc.pdf"}
        )
        assert result is not None


class TestFileMove:

    async def test_file_move(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_move",
            {
                "src_path": "/home/old.txt",
                "dst_path": "/home/new.txt",
            },
        )
        assert result is not None


class TestFileSearch:

    async def test_file_search(self, synology_server):
        result = await synology_server._dispatch(
            "syno_file_search", {"query": "found"}
        )
        assert result["count"] == 1


class TestSystemInfo:

    async def test_system_info(self, synology_server):
        result = await synology_server._dispatch("syno_system_info", {})
        assert result["model"] == "DS920+"


class TestStorageInfo:

    async def test_storage_info(self, synology_server):
        result = await synology_server._dispatch("syno_storage_info", {})
        assert len(result["volumes"]) == 1


class TestListShares:

    async def test_list_shares(self, synology_server):
        result = await synology_server._dispatch("syno_list_shares", {})
        assert result["count"] == 1


class TestUnknownTool:

    async def test_unknown_tool_raises(self, synology_server):
        with pytest.raises(ValueError, match="Unknown tool"):
            await synology_server._dispatch("syno_nonexistent", {})
