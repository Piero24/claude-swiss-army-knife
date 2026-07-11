"""YAML frontmatter parser for Obsidian notes."""

from typing import Optional

import yaml


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from a markdown note.

    Frontmatter is delimited by --- at the start and end.
    E.g.:
        ---
        title: My Note
        tags: [a, b]
        ---
        # Content starts here

    Args:
        content: Raw markdown content.

    Returns:
        Tuple of (frontmatter_dict, body_text).
        If no frontmatter, returns ({}, content).
    """
    if not content.startswith("---"):
        return {}, content

    # Find the closing ---
    end_idx = content.find("---", 3)
    if end_idx == -1:
        return {}, content

    fm_text = content[3:end_idx].strip()
    body = content[end_idx + 3 :].lstrip()

    if not fm_text:
        return {}, body

    try:
        fm = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return {}, body

    return fm, body


def get_tags(content: str) -> list[str]:
    """Extract tags from a note's frontmatter.

    Args:
        content: Raw markdown content.

    Returns:
        List of tag strings.
    """
    fm, _ = parse_frontmatter(content)
    tags = fm.get("tags", [])
    if isinstance(tags, str):
        return [tags]
    return tags if isinstance(tags, list) else []


def get_title(content: str, default: str = "Untitled") -> str:
    """Get the title from frontmatter or first heading.

    Args:
        content: Raw markdown content.
        default: Fallback title.

    Returns:
        Title string.
    """
    fm, body = parse_frontmatter(content)
    if "title" in fm:
        return str(fm["title"])

    # Try first # heading
    for line in body.split("\n"):
        line = line.strip()
        if line.startswith("# ") and not line.startswith("## "):
            return line[2:].strip()

    return default


def build_frontmatter(fm: dict) -> str:
    """Build a YAML frontmatter string from a dict.

    Args:
        fm: Frontmatter key-value pairs.

    Returns:
        YAML string with --- delimiters.
    """
    if not fm:
        return ""
    fm_yaml = yaml.dump(
        fm, default_flow_style=False, sort_keys=False, allow_unicode=True
    ).strip()
    return f"---\n{fm_yaml}\n---\n"
