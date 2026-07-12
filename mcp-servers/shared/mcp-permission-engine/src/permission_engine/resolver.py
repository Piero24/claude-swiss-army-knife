"""Path resolver with glob matching, longest-match precedence, and explicit-deny override."""

from collections import OrderedDict

from .models import AccessLevel, PathRule


class PathResolver:
    """Resolves access levels for file paths against configured rules.

    Rules:
    1. Exact match wins over glob match
    2. Longest glob match wins over shorter
    3. Explicit NONE always wins (safety override)
    4. Default applies if no rule matches
    """

    def __init__(
        self,
        rules: list[PathRule],
        default_access: AccessLevel = AccessLevel.NONE,
    ):
        # Sort rules: exact matches first, then by path length descending (longest match wins)
        # None (deny) rules are separated to check them first
        deny_rules = [r for r in rules if r.access == AccessLevel.NONE]
        allow_rules = [r for r in rules if r.access != AccessLevel.NONE]

        # Within deny rules: longest path first
        deny_rules.sort(key=lambda r: len(r.path), reverse=True)
        # Within allow rules: longest path first
        allow_rules.sort(key=lambda r: len(r.path), reverse=True)

        # Deny rules checked first (safety override)
        self._rules = deny_rules + allow_rules
        self._default_access = default_access
        self._rule_cache: OrderedDict[str, AccessLevel] = OrderedDict()
        self._cache_max_size = 1000

    def resolve(self, requested_path: str) -> AccessLevel:
        """Determine the access level for a given path.

        Args:
            requested_path: The filesystem path to check (must be normalized/clean).

        Returns:
            The AccessLevel that applies to this path.
        """
        # Normalize path for matching
        clean_path = requested_path.rstrip("/") or "/"

        # Check cache
        if clean_path in self._rule_cache:
            return self._rule_cache[clean_path]

        # Walk rules in order — first match wins
        for rule in self._rules:
            if self._path_matches(clean_path, rule.path):
                self._cache_result(clean_path, rule.access)
                return rule.access

        # No rule matched — return default
        self._cache_result(clean_path, self._default_access)
        return self._default_access

    def resolve_with_rule(
        self, requested_path: str
    ) -> tuple[AccessLevel, PathRule | None]:
        """Resolve access level and return the matching rule (if any).

        Args:
            requested_path: The filesystem path to check.

        Returns:
            Tuple of (access_level, matching_rule_or_None).
        """
        clean_path = requested_path.rstrip("/") or "/"

        for rule in self._rules:
            if self._path_matches(clean_path, rule.path):
                return rule.access, rule

        return self._default_access, None

    @staticmethod
    def _path_matches(path: str, pattern: str) -> bool:
        """Check if a path matches a glob pattern.

        Supports:
        - Exact match: /var/log/syslog matches /var/log/syslog
        - Single-level wildcard: /var/log/* matches /var/log/syslog (not /var/log/nginx/access.log)
        - Recursive wildcard: /var/log/** matches /var/log/nginx/access.log
        - Directory prefix: /var/log matches /var/log/syslog AND /var/log itself

        Uses pathlib.PurePosixPath.match() which correctly handles * as
        single-level only (unlike fnmatch on some platforms).
        """
        from pathlib import PurePosixPath

        # Exact match
        if path == pattern:
            return True

        # Directory prefix: if pattern is a directory path without wildcards,
        # it matches that directory and everything under it
        if "*" not in pattern and "?" not in pattern and "[" not in pattern:
            pattern_prefix = pattern.rstrip("/")
            if path == pattern_prefix or path.startswith(pattern_prefix + "/"):
                return True
            return False

        # Use PurePosixPath.match() for correct glob semantics
        # * matches only within one path segment, ** matches across slashes
        ppath = PurePosixPath(path)
        try:
            if ppath.match(pattern):
                return True
        except (ValueError, TypeError):
            pass

        # Also match descendants: if pattern has **, try matching parent paths
        if "**" in pattern:
            parts = path.split("/")
            for i in range(len(parts), 0, -1):
                partial = PurePosixPath("/".join(parts[:i]) or "/")
                try:
                    if partial.match(pattern):
                        return True
                except (ValueError, TypeError):
                    continue

        # If pattern ends with /**, the folder itself matches (e.g. /Google Drive/** matches /Google Drive)
        if pattern.endswith("/**"):
            folder = pattern[:-3]  # strip /**
            if path == folder or path == folder.rstrip("/"):
                return True

        return False

    def _cache_result(self, path: str, access: AccessLevel) -> None:
        """Cache a resolution result, evicting oldest entry if at max size."""
        if len(self._rule_cache) >= self._cache_max_size:
            self._rule_cache.popitem(last=False)
        self._rule_cache[path] = access

    def invalidate_cache(self) -> None:
        """Clear the resolution cache (call after config reload)."""
        self._rule_cache.clear()
