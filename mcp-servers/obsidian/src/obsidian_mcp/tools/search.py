"""Obsidian search utilities: ripgrep full-text search, tag search, and tag listing."""

import logging
import subprocess

from ..frontmatter import get_tags, get_title
from ..vault_backend import LocalVaultBackend

logger = logging.getLogger(__name__)


def ripgrep_search(
    vault_root: str, query: str, max_results: int = 20, regex: bool = False
) -> list[dict]:
    """Search vault with ripgrep."""
    cmd = [
        "rg",
        "--type",
        "md",
        "--line-number",
        "--max-count",
        str(max_results),
    ]
    if not regex:
        cmd.append("--fixed-strings")
    cmd.extend(["--", query, vault_root])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        lines = (
            result.stdout.strip().split("\n") if result.stdout.strip() else []
        )
        return [
            {
                "file": parts[0],
                "line": int(parts[1]),
                "snippet": ":".join(parts[2:]) if len(parts) > 2 else "",
            }
            for line in lines
            if (parts := line.split(":", 2))
        ]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        logger.warning("ripgrep search failed: %s", e)
        return [{"error": str(e)}]


async def search_by_tag(vault: LocalVaultBackend, tag: str) -> list[dict]:
    """Find all notes containing a specific tag."""
    results = []
    for note_path in await vault.get_all_notes():
        try:
            content = note_path.read_text(encoding="utf-8")
            tags = get_tags(content)
            if tag in tags:
                rel_path = str(note_path.relative_to(vault.root))
                results.append(
                    {
                        "path": rel_path,
                        "title": get_title(content, note_path.stem),
                        "tags": tags,
                    }
                )
        except Exception:
            continue
    return results


async def get_all_tags(vault: LocalVaultBackend) -> list[dict]:
    """Get all unique tags with counts."""
    tag_counts: dict[str, int] = {}
    for note_path in await vault.get_all_notes():
        try:
            content = note_path.read_text(encoding="utf-8")
            tags = get_tags(content)
            for tag in tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        except Exception:
            continue
    return [
        {"tag": tag, "count": count}
        for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1])
    ]
