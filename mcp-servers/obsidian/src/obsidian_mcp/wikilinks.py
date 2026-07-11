"""Wikilink parser and backlink resolver for Obsidian notes."""

import re
from pathlib import Path
from typing import Optional

# Matches [[link]] and [[link|alias]] and [[link#heading]] and [[link#heading|alias]]
_WIKILINK_PATTERN = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")


def extract_links(content: str) -> list[str]:
    """Extract all wikilink targets from note content.

    Args:
        content: Raw markdown content.

    Returns:
        List of link target page names (without [[]]).
    """
    matches = _WIKILINK_PATTERN.findall(content)
    return [m.strip() for m in matches]


def find_backlinks(vault_root: Path, target_note: str) -> list[dict]:
    """Find all notes that link to a target note via [[wikilinks]].

    Scans all .md files in the vault for [[target]] references.

    Args:
        vault_root: Path to the vault root directory.
        target_note: The note name to find backlinks for (with or without .md).

    Returns:
        List of {path, title, context} dicts for each backlink found.
    """
    import os

    target_name = Path(target_note).stem  # Remove .md extension
    backlinks = []

    for root, dirs, files in os.walk(vault_root):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if not f.endswith(".md"):
                continue
            filepath = Path(root) / f
            try:
                content = filepath.read_text(encoding="utf-8")
            except Exception:
                continue

            # Search for [[target]] references
            pattern = re.compile(
                r"\[\["
                + re.escape(target_name)
                + r"(?:#[^\]]*)?(?:\|[^\]]*)?\]\]"
            )
            matches = pattern.finditer(content)
            for match in matches:
                # Get some context around the link
                start = max(0, match.start() - 40)
                end = min(len(content), match.end() + 40)
                context = content[start:end].replace("\n", " ").strip()
                if start > 0:
                    context = "..." + context
                if end < len(content):
                    context = context + "..."

                backlinks.append(
                    {
                        "path": str(filepath.relative_to(vault_root)),
                        "title": _get_title_from_content(content, f),
                        "context": context,
                    }
                )

    return backlinks


def _get_title_from_content(content: str, filename: str) -> str:
    """Quick title extraction without full frontmatter parse."""
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            import yaml

            try:
                fm = yaml.safe_load(content[3:end])
                if fm and "title" in fm:
                    return str(fm["title"])
            except Exception:
                pass
    # Try first # heading
    for line in content.split("\n"):
        if line.strip().startswith("# ") and not line.strip().startswith("## "):
            return line.strip()[2:]
    return filename.replace(".md", "")
