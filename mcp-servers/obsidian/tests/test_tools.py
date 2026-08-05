"""Unit tests for obsidian MCP tool handlers with mocked vault."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
import yaml


@pytest.fixture
def mock_vault():
    """Return a MagicMock that behaves like LocalVaultBackend."""
    vault = MagicMock()
    vault.root = Path("/data/vaults")
    vault.list_vault = AsyncMock(
        return_value=[
            {
                "name": "note1.md",
                "path": "note1.md",
                "is_dir": False,
                "size": 100,
                "modified": "2024-01-01T00:00:00",
            },
            {
                "name": "folder",
                "path": "folder",
                "is_dir": True,
                "size": 0,
                "modified": "2024-01-01T00:00:00",
            },
        ]
    )
    vault.read_note = AsyncMock(
        return_value="---\ntitle: Test\n---\n# Hello World\n\nContent here."
    )
    vault.write_note = AsyncMock(return_value=Path("/data/vaults/new_note.md"))
    vault.delete_note = AsyncMock(
        return_value={
            "deleted": True,
            "path": "old_note.md",
            "trashed": True,
            "trash_path": ".trash/old_note.md",
        }
    )
    vault.note_exists = AsyncMock(return_value=True)
    vault.get_all_notes = AsyncMock(
        return_value=[
            Path("/data/vaults/a.md"),
            Path("/data/vaults/b.md"),
            Path("/data/vaults/c.md"),
        ]
    )
    return vault


@pytest.fixture
def obsidian_config():
    """Create a minimal test config YAML for the obsidian server."""
    return {
        "server": {
            "name": "obsidian",
            "log_level": "INFO",
            "audit_log": "/dev/null",
        },
        "permissions": {
            "default_access": "none",
            "paths": [
                {"path": "/**", "access": "read", "id": "all_read"},
                {"path": "/new_note.md", "access": "write", "id": "new_write"},
                {"path": "/old_note.md", "access": "write", "id": "old_write"},
            ],
            "commands": [
                {"pattern": "rg *", "access": "active", "id": "rg_cmd"}
            ],
            "default_command_access": "none",
        },
    }


@pytest.fixture
def obsidian_server(obsidian_config, mock_vault):
    """Create an ObsidianServer with a mocked vault."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as f:
        yaml.dump(obsidian_config, f)
        config_path = f.name

    with patch("obsidian_mcp.server.create_backend", return_value=mock_vault):
        from obsidian_mcp.server import ObsidianServer

        server = ObsidianServer(config_path)
    return server


class TestListVault:

    async def test_list_root(self, obsidian_server):
        result = await obsidian_server._dispatch("obsidian_list_vault", {})
        assert result["count"] == 2
        assert result["entries"][0]["name"] == "note1.md"

    async def test_list_subfolder(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_list_vault", {"subfolder": "projects"}
        )
        assert result["count"] == 2

    async def test_list_with_depth(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_list_vault", {"depth": 1}
        )
        assert result["count"] == 2


class TestReadNote:

    async def test_read_note_with_frontmatter(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_read_note", {"path": "test.md"}
        )
        assert result["path"] == "test.md"
        assert result["frontmatter"] == {"title": "Test"}
        assert "Hello World" in result["body"]

    async def test_read_note_plain(self, obsidian_server):
        obsidian_server.vault.read_note = AsyncMock(
            return_value="# Just a heading\n\nNo frontmatter."
        )
        result = await obsidian_server._dispatch(
            "obsidian_read_note", {"path": "plain.md"}
        )
        assert result["frontmatter"] == {}
        assert "Just a heading" in result["body"]


class TestWriteNote:

    async def test_write_note(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_write_note",
            {
                "path": "new_note.md",
                "content": "# New Note\n\nHello.",
            },
        )
        assert result["written"] is True
        assert "new_note.md" in result["path"]

    async def test_write_note_with_frontmatter(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_write_note",
            {
                "path": "new_note.md",
                "content": "Body text.",
                "frontmatter": {"title": "Custom", "tags": ["a", "b"]},
            },
        )
        assert result["written"] is True
        obsidian_server.vault.write_note.assert_called_once()
        call_content = obsidian_server.vault.write_note.call_args[0][1]
        assert "title: Custom" in call_content
        assert "tags:" in call_content


class TestDeleteNote:

    async def test_delete_note_soft(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_delete_note", {"path": "old_note.md"}
        )
        assert result["deleted"] is True
        assert result["trashed"] is True

    async def test_delete_note_permanent(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_delete_note",
            {
                "path": "old_note.md",
                "permanent": True,
            },
        )
        assert result["deleted"] is True


class TestSearchNotes:

    @patch("obsidian_mcp.server._ripgrep_search")
    async def test_search_notes(self, mock_rg, obsidian_server):
        mock_rg.return_value = [
            {"path": "a.md", "line": 1, "snippet": "hello world"},
            {"path": "b.md", "line": 5, "snippet": "hello again"},
        ]
        result = await obsidian_server._dispatch(
            "obsidian_search_notes", {"query": "hello"}
        )
        assert result["count"] == 2

    @patch("obsidian_mcp.server._ripgrep_search")
    async def test_search_notes_with_regex(self, mock_rg, obsidian_server):
        mock_rg.return_value = []
        result = await obsidian_server._dispatch(
            "obsidian_search_notes",
            {
                "query": "foo.*bar",
                "regex": True,
            },
        )
        assert result["count"] == 0


class TestSearchByTag:

    async def test_search_by_tag(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_search_by_tag", {"tag": "python"}
        )
        assert "count" in result


class TestGetBacklinks:

    @patch("obsidian_mcp.server.find_backlinks")
    async def test_get_backlinks(self, mock_bl, obsidian_server):
        mock_bl.return_value = [
            {"path": "other.md", "title": "Other", "snippet": "see [[target]]"},
        ]
        result = await obsidian_server._dispatch(
            "obsidian_get_backlinks", {"path": "target.md"}
        )
        assert result["count"] == 1
        assert result["target"] == "target.md"


class TestGetTags:

    @patch("obsidian_mcp.server._get_all_tags")
    async def test_get_tags(self, mock_tags, obsidian_server):
        mock_tags.return_value = [
            {"tag": "python", "count": 5},
            {"tag": "docs", "count": 3},
        ]
        result = await obsidian_server._dispatch("obsidian_get_tags", {})
        assert len(result["tags"]) == 2


class TestGetFrontmatter:

    async def test_get_frontmatter(self, obsidian_server):
        result = await obsidian_server._dispatch(
            "obsidian_get_frontmatter", {"path": "test.md"}
        )
        assert result["path"] == "test.md"
        assert result["frontmatter"] == {"title": "Test"}


class TestUnknownTool:

    async def test_unknown_tool_raises(self, obsidian_server):
        with pytest.raises(ValueError, match="Unknown tool"):
            await obsidian_server._dispatch("obsidian_nonexistent", {})
