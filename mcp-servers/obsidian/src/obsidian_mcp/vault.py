"""Vault abstraction — filesystem access to an Obsidian vault."""

import os
from datetime import datetime
from pathlib import Path
from typing import Optional


class Vault:
    """Represents an Obsidian vault on the filesystem.

    Provides methods to navigate, read, write, and search notes.
    The vault is a directory of .md files with optional YAML frontmatter.
    """

    def __init__(self, vault_path: str | Path):
        self.root = Path(vault_path).resolve()
        if not self.root.exists():
            raise FileNotFoundError(f"Vault not found: {self.root}")
        if not self.root.is_dir():
            raise NotADirectoryError(
                f"Vault path is not a directory: {self.root}"
            )

    def resolve_path(self, relative_path: str) -> Path:
        """Safely resolve a relative path within the vault.

        Args:
            relative_path: Path relative to vault root.

        Returns:
            Absolute Path within the vault.

        Raises:
            ValueError: If the path would escape the vault.
        """
        clean = relative_path.lstrip("/")
        full = (self.root / clean).resolve()

        # Ensure it's within the vault
        try:
            full.relative_to(self.root)
        except ValueError:
            raise ValueError(f"Path escapes vault: {relative_path}")

        return full

    def note_exists(self, relative_path: str) -> bool:
        """Check if a note exists."""
        path = self.resolve_path(relative_path)
        # Allow .md extension to be optional
        if path.exists():
            return True
        md_path = path.with_suffix(".md")
        return md_path.exists()

    def resolve_note_path(self, relative_path: str) -> Path:
        """Resolve a note path, adding .md if needed."""
        path = self.resolve_path(relative_path)
        if path.exists():
            return path
        md_path = path.with_suffix(".md")
        if md_path.exists():
            return md_path
        # Return the .md path even if it doesn't exist (for writes)
        return md_path

    def read_note(self, relative_path: str) -> str:
        """Read a note's raw markdown content.

        Args:
            relative_path: Path relative to vault root.

        Returns:
            Raw markdown string.
        """
        path = self.resolve_note_path(relative_path)
        if not path.exists():
            raise FileNotFoundError(f"Note not found: {relative_path}")
        return path.read_text(encoding="utf-8")

    def write_note(self, relative_path: str, content: str) -> Path:
        """Write (create or overwrite) a note.

        Args:
            relative_path: Path relative to vault root.
            content: Markdown content to write.

        Returns:
            Path to the written note.
        """
        path = self.resolve_path(relative_path)
        if path.suffix != ".md":
            path = path.with_suffix(".md")

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def delete_note(self, relative_path: str, permanent: bool = False) -> dict:
        """Delete a note. By default moves to .trash/ folder.

        Args:
            relative_path: Path relative to vault root.
            permanent: If True, permanently delete instead of trash.

        Returns:
            Dict with deletion result.
        """
        path = self.resolve_note_path(relative_path)
        if not path.exists():
            raise FileNotFoundError(f"Note not found: {relative_path}")

        if permanent:
            path.unlink()
            return {"deleted": True, "path": relative_path, "trashed": False}

        # Soft delete: move to .trash/
        trash_dir = self.root / ".trash"
        trash_dir.mkdir(exist_ok=True)
        trash_path = trash_dir / path.name
        # Avoid overwriting existing trash files
        if trash_path.exists():
            stem = path.stem
            trash_path = (
                trash_dir
                / f"{stem}_{datetime.now().strftime('%Y%m%d%H%M%S')}.md"
            )
        path.rename(trash_path)
        return {
            "deleted": True,
            "path": relative_path,
            "trashed": True,
            "trash_path": str(trash_path.relative_to(self.root)),
        }

    def list_vault(self, subfolder: str = "", depth: int = 3) -> list[dict]:
        """List the vault directory structure.

        Args:
            subfolder: Subfolder to list (empty = root).
            depth: Maximum depth to traverse.

        Returns:
            List of {name, path, is_dir, size, modified} dicts.
        """
        base = self.root if not subfolder else self.resolve_path(subfolder)
        if not base.exists():
            raise FileNotFoundError(f"Folder not found: {subfolder}")

        entries = []
        self._walk(base, entries, max_depth=depth, current_depth=1)
        return entries

    def _walk(
        self, directory: Path, entries: list, max_depth: int, current_depth: int
    ) -> None:
        """Recursively walk a directory up to max_depth."""
        if current_depth > max_depth:
            return
        try:
            for entry in sorted(directory.iterdir()):
                # Skip hidden files/folders except .trash
                if entry.name.startswith(".") and entry.name != ".trash":
                    continue
                stat = entry.stat()
                entries.append(
                    {
                        "name": entry.name,
                        "path": str(entry.relative_to(self.root)),
                        "is_dir": entry.is_dir(),
                        "size": stat.st_size if entry.is_file() else 0,
                        "modified": datetime.fromtimestamp(
                            stat.st_mtime
                        ).isoformat(),
                    }
                )
                if entry.is_dir() and current_depth < max_depth:
                    self._walk(entry, entries, max_depth, current_depth + 1)
        except PermissionError:
            pass

    def get_all_notes(self) -> list[Path]:
        """Get all .md files in the vault (for indexing)."""
        notes = []
        for root, dirs, files in os.walk(self.root):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f in files:
                if f.endswith(".md"):
                    notes.append(Path(root) / f)
        return notes
