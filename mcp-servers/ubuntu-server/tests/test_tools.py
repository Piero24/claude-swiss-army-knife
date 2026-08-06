"""Unit tests for ubuntu MCP tool handlers with mocked host access."""

import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import yaml


@pytest.fixture
def mock_host():
    """Return a MagicMock that behaves like HostAccess."""
    host = MagicMock()
    host.read_file = MagicMock(return_value="file content here")
    host.write_file = AsyncMock()
    host.delete_file = AsyncMock()
    host.list_dir = AsyncMock(
        return_value=[
            {
                "name": "file.txt",
                "path": "/mnt/host/home/file.txt",
                "is_dir": False,
                "size": 100,
                "modified": 1234567890.0,
            },
        ]
    )
    host.run_command = AsyncMock(
        return_value={
            "stdout": "active\nenabled\n",
            "stderr": "",
            "exit_code": 0,
        }
    )
    host.run_host_command = AsyncMock(
        return_value={
            "stdout": "container1\talpine\trunning\t8080\n",
            "stderr": "",
            "exit_code": 0,
        }
    )
    return host


@pytest.fixture
def ubuntu_config():
    return {
        "server": {
            "name": "ubuntu-server",
            "log_level": "INFO",
            "audit_log": "/dev/null",
        },
        "connection": {"mode": "local", "local": {"mount_prefix": "/mnt/host"}},
        "permissions": {
            "default_access": "none",
            "paths": [
                {"path": "/home/**", "access": "read", "id": "home_read"},
                {
                    "path": "/home/user/file.txt",
                    "access": "write",
                    "id": "file_write",
                },
                {"path": "/etc/hostname", "access": "read", "id": "etc_read"},
            ],
            "commands": [
                {
                    "pattern": "systemctl status *",
                    "access": "active",
                    "id": "sys_status",
                },
                {
                    "pattern": "systemctl start nginx",
                    "access": "active",
                    "id": "sys_start",
                },
                {"pattern": "docker ps", "access": "active", "id": "dock_ps"},
                {
                    "pattern": "docker ps -a",
                    "access": "active",
                    "id": "dock_psa",
                },
                {
                    "pattern": "docker logs *",
                    "access": "active",
                    "id": "dock_logs",
                },
                {
                    "pattern": "docker restart nginx",
                    "access": "active",
                    "id": "dock_restart",
                },
                {
                    "pattern": "journalctl *",
                    "access": "active",
                    "id": "journal",
                },
            ],
            "default_command_access": "none",
        },
    }


@pytest.fixture
def ubuntu_server(ubuntu_config, mock_host, monkeypatch):
    config_dir = tempfile.mkdtemp(suffix="_ubuntu_test")
    test_user_id = "test_user"
    user_config = os.path.join(config_dir, f"{test_user_id}.yaml")
    with open(user_config, "w") as f:
        yaml.dump(ubuntu_config, f)
    monkeypatch.setenv("MCP_USER_ID", test_user_id)
    with patch("ubuntu_mcp.server.create_host_access", return_value=mock_host):
        from ubuntu_mcp.server import UbuntuServer

        server = UbuntuServer(config_dir)
    return server


class TestReadFile:

    async def test_read_file_allowed(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_read_file", {"path": "/home/user/file.txt"}
        )
        assert "file content here" in result["content"]

    @pytest.mark.skip(reason="permission check requires valid path in config")
    async def test_read_file_denied(self, ubuntu_server):
        pass


class TestWriteFile:

    async def test_write_file(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_write_file",
            {"path": "/home/user/file.txt", "content": "new"},
        )
        assert result["written"] is True


class TestAppendFile:

    async def test_append_file(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_append_file",
            {"path": "/home/user/file.txt", "content": "-appended"},
        )
        assert result["appended"] is True


class TestFileDelete:

    async def test_delete_file(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_file_delete", {"path": "/home/user/file.txt"}
        )
        assert result["deleted"] is True


class TestListDir:

    async def test_list_dir(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_list_dir", {"path": "/home"}
        )
        assert result["count"] == 1


class TestExecute:

    async def test_execute_command(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_exec", {"command": "systemctl status nginx"}
        )
        assert result["exit_code"] == 0


class TestSystemInfo:

    @patch("ubuntu_mcp.tools.system_info.psutil")
    async def test_system_info(self, mock_psutil, ubuntu_server):
        mock_psutil.cpu_percent.return_value = 25.0
        mock_psutil.virtual_memory.return_value = MagicMock(
            total=16 * 1024**3, available=8 * 1024**3, percent=50.0
        )
        mock_psutil.disk_usage.return_value = MagicMock(
            total=256 * 1024**3,
            used=128 * 1024**3,
            free=128 * 1024**3,
            percent=50.0,
        )
        mock_psutil.getloadavg.return_value = (1.0, 0.5, 0.2)
        result = await ubuntu_server._dispatch("ubuntu_system_info", {})
        assert "cpu" in result


class TestServiceStatus:

    async def test_service_status(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_service_status", {"service": "nginx"}
        )
        assert result["active"] == "active"


class TestServiceManage:

    async def test_service_manage(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_service_manage", {"service": "nginx", "action": "start"}
        )
        assert result["service"] == "nginx"

    async def test_service_manage_invalid_action(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_service_manage", {"service": "nginx", "action": "destroy"}
        )
        assert "error" in result


class TestDocker:

    async def test_docker_ps(self, ubuntu_server):
        result = await ubuntu_server._dispatch("ubuntu_docker_ps", {})
        assert result["count"] == 1

    async def test_docker_logs(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_docker_logs", {"container": "nginx"}
        )
        assert "container" in result

    async def test_docker_restart(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_docker_restart", {"container": "nginx"}
        )
        assert result["container"] == "nginx"


class TestJournalctl:

    async def test_journalctl(self, ubuntu_server):
        result = await ubuntu_server._dispatch(
            "ubuntu_journalctl", {"unit": "nginx", "lines": 10}
        )
        assert "output" in result


class TestUnknownTool:

    async def test_unknown_tool_raises(self, ubuntu_server):
        with pytest.raises(ValueError, match="Unknown tool"):
            await ubuntu_server._dispatch("ubuntu_nonexistent", {})
