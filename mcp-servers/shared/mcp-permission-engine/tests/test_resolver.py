"""Tests for the path resolver — glob matching, precedence, caching."""

import pytest
from permission_engine.models import AccessLevel, PathRule
from permission_engine.resolver import PathResolver


class TestPathResolver:
    """Path resolution tests."""

    def test_exact_match(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log/syslog", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/var/log/syslog") == AccessLevel.READ

    def test_exact_match_trailing_slash(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/var/log/") == AccessLevel.READ

    def test_single_level_glob(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log/*", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/var/log/syslog") == AccessLevel.READ
        assert resolver.resolve("/var/log/nginx/access.log") == AccessLevel.NONE

    def test_recursive_glob(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log/**", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/var/log/syslog") == AccessLevel.READ
        assert resolver.resolve("/var/log/nginx/access.log") == AccessLevel.READ
        assert (
            resolver.resolve("/var/log/a/b/c/d/e/file.txt") == AccessLevel.READ
        )

    def test_directory_prefix_match(self):
        """A non-glob directory path should match that directory and all descendants."""
        resolver = PathResolver(
            [
                PathRule(path="/var/www", access=AccessLevel.WRITE),
            ]
        )
        assert resolver.resolve("/var/www") == AccessLevel.WRITE
        assert resolver.resolve("/var/www/index.html") == AccessLevel.WRITE
        assert resolver.resolve("/var/www/blog/post.md") == AccessLevel.WRITE

    def test_longest_match_wins(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/www/**", access=AccessLevel.READ),
                PathRule(path="/var/www/admin/**", access=AccessLevel.WRITE),
            ]
        )
        # Longer match should win
        assert (
            resolver.resolve("/var/www/admin/config.php") == AccessLevel.WRITE
        )
        # Shorter match for non-admin
        assert resolver.resolve("/var/www/blog/post.md") == AccessLevel.READ

    def test_explicit_deny_overrides_everything(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/www/**", access=AccessLevel.WRITE),
                PathRule(path="/var/www/admin/**", access=AccessLevel.READ),
                PathRule(
                    path="/var/www/admin/secrets/**", access=AccessLevel.NONE
                ),
            ]
        )
        # Explicit deny ALWAYS wins
        assert (
            resolver.resolve("/var/www/admin/secrets/passwords.txt")
            == AccessLevel.NONE
        )
        # Longer allow still works
        assert resolver.resolve("/var/www/admin/config.php") == AccessLevel.READ
        # Shorter allow
        assert resolver.resolve("/var/www/blog/post.md") == AccessLevel.WRITE

    def test_default_access(self):
        resolver = PathResolver([], default_access=AccessLevel.NONE)
        assert resolver.resolve("/any/path") == AccessLevel.NONE

        resolver = PathResolver([], default_access=AccessLevel.READ)
        assert resolver.resolve("/any/path") == AccessLevel.READ

    def test_default_when_no_match(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log/**", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/etc/passwd") == AccessLevel.NONE

    def test_multiple_deny_rules_checked_first(self):
        """Explicit deny rules are always checked before allow rules."""
        resolver = PathResolver(
            [
                PathRule(path="/data/**", access=AccessLevel.WRITE),
                PathRule(path="/data/private/**", access=AccessLevel.NONE),
                PathRule(path="/data/public/**", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/data/private/secret.txt") == AccessLevel.NONE
        assert resolver.resolve("/data/public/info.txt") == AccessLevel.READ
        assert resolver.resolve("/data/other/file.txt") == AccessLevel.WRITE

    def test_cache_hit(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log/**", access=AccessLevel.READ),
            ]
        )
        # First call populates cache
        r1 = resolver.resolve("/var/log/test.log")
        # Second call hits cache
        r2 = resolver.resolve("/var/log/test.log")
        assert r1 == r2 == AccessLevel.READ

    def test_cache_invalidation(self):
        resolver = PathResolver(
            [
                PathRule(path="/var/log/**", access=AccessLevel.READ),
            ]
        )
        resolver.resolve("/var/log/test.log")
        resolver.invalidate_cache()
        # Should still work after cache clear
        assert resolver.resolve("/var/log/test.log") == AccessLevel.READ

    def test_root_path(self):
        resolver = PathResolver(
            [
                PathRule(path="/", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/") == AccessLevel.READ
        assert resolver.resolve("/etc") == AccessLevel.READ

    def test_resolve_with_rule(self):
        resolver = PathResolver(
            [
                PathRule(
                    path="/var/www/**",
                    access=AccessLevel.WRITE,
                    description="Web root",
                ),
            ]
        )
        access, rule = resolver.resolve_with_rule("/var/www/index.html")
        assert access == AccessLevel.WRITE
        assert rule is not None
        assert rule.description == "Web root"

        access, rule = resolver.resolve_with_rule("/etc/passwd")
        assert access == AccessLevel.NONE
        assert rule is None

    def test_wildcard_question_mark(self):
        """? matches single character."""
        resolver = PathResolver(
            [
                PathRule(path="/var/log/syslog.?", access=AccessLevel.READ),
            ]
        )
        assert resolver.resolve("/var/log/syslog.1") == AccessLevel.READ
        assert resolver.resolve("/var/log/syslog.12") == AccessLevel.NONE
