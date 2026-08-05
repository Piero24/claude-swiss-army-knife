"""Link storage and query logic — reads from the YAML config."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _get_links(config: dict) -> list[dict]:
    """Extract the links list from a parsed config dict."""
    return config.get("links", []) or []


def list_links(
    config: dict,
    category: Optional[str] = None,
    tag: Optional[str] = None,
) -> list[dict]:
    """List links, optionally filtered by category or tag.

    Args:
        config: The parsed YAML config dict.
        category: Optional category filter.
        tag: Optional tag filter.

    Returns:
        List of matching link dicts (without full description for brevity).
    """
    links = _get_links(config)
    if category:
        links = [l for l in links if l.get("category") == category]
    if tag:
        links = [l for l in links if tag in (l.get("tags") or [])]
    return [
        {
            "name": l["name"],
            "url": l["url"],
            "description": l.get("description", ""),
            "category": l.get("category", ""),
            "tags": l.get("tags", []),
        }
        for l in links
    ]


def search_links(config: dict, query: str) -> list[dict]:
    """Search links by name, description, or URL.

    Args:
        config: The parsed YAML config dict.
        query: Case-insensitive search string.

    Returns:
        List of matching link dicts.
    """
    q = query.lower()
    results = []
    for l in _get_links(config):
        name = (l.get("name") or "").lower()
        desc = (l.get("description") or "").lower()
        url = (l.get("url") or "").lower()
        if q in name or q in desc or q in url:
            results.append(
                {
                    "name": l["name"],
                    "url": l["url"],
                    "description": l.get("description", ""),
                    "category": l.get("category", ""),
                    "tags": l.get("tags", []),
                }
            )
    return results


def get_link(config: dict, name: str) -> Optional[dict]:
    """Get a single link by exact name match.

    Args:
        config: The parsed YAML config dict.
        name: Exact link name.

    Returns:
        Full link dict or None.
    """
    for l in _get_links(config):
        if l.get("name") == name:
            return dict(l)
    return None


def list_categories(config: dict) -> list[dict]:
    """List all categories with link counts.

    Args:
        config: The parsed YAML config dict.

    Returns:
        List of {category, count} dicts sorted by count desc.
    """
    counts: dict[str, int] = {}
    for l in _get_links(config):
        cat = l.get("category", "uncategorized")
        counts[cat] = counts.get(cat, 0) + 1
    return [
        {"category": k, "count": v}
        for k, v in sorted(counts.items(), key=lambda x: -x[1])
    ]


def add_link(config: dict, name: str, url: str, **kwargs) -> dict:
    """Add a new link to the config (in-memory only — caller must persist).

    Args:
        config: The parsed YAML config dict (mutated in place).
        name: Link name.
        url: Link URL.
        **kwargs: description, category, tags.

    Returns:
        The newly added link dict.
    """
    link = {"name": name, "url": url}
    if "description" in kwargs:
        link["description"] = kwargs["description"]
    if "category" in kwargs:
        link["category"] = kwargs["category"]
    if "tags" in kwargs:
        link["tags"] = kwargs["tags"]
    config.setdefault("links", []).append(link)
    logger.info("Link added: %s -> %s", name, url)
    return link


def remove_link(config: dict, name: str) -> bool:
    """Remove a link by name (in-memory only — caller must persist).

    Args:
        config: The parsed YAML config dict (mutated in place).
        name: Link name to remove.

    Returns:
        True if removed, False if not found.
    """
    links = config.get("links", [])
    for i, l in enumerate(links):
        if l.get("name") == name:
            links.pop(i)
            logger.info("Link removed: %s", name)
            return True
    return False
