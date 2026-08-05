"""Smoke tests for link-manager MCP."""

import pytest


class TestModuleImports:

    def test_import_server(self):
        from link_manager.server import LinkManagerServer

        assert LinkManagerServer is not None

    def test_import_links(self):
        from link_manager import links

        assert links is not None


class TestLinks:

    def test_list_links_empty(self):
        from link_manager.links import list_links

        result = list_links({})
        assert result == []

    def test_list_links_with_data(self):
        from link_manager.links import list_links

        config = {
            "links": [
                {
                    "name": "Test",
                    "url": "https://example.com",
                    "category": "dev",
                }
            ]
        }
        result = list_links(config)
        assert len(result) == 1
        assert result[0]["name"] == "Test"

    def test_list_links_filter_by_category(self):
        from link_manager.links import list_links

        config = {
            "links": [
                {"name": "A", "url": "https://a.com", "category": "dev"},
                {"name": "B", "url": "https://b.com", "category": "docs"},
            ]
        }
        result = list_links(config, category="dev")
        assert len(result) == 1
        assert result[0]["name"] == "A"

    def test_search_links(self):
        from link_manager.links import search_links

        config = {
            "links": [
                {
                    "name": "GitHub",
                    "url": "https://github.com",
                    "description": "Code hosting",
                },
                {
                    "name": "Docs",
                    "url": "https://docs.example.com",
                    "description": "API docs",
                },
            ]
        }
        result = search_links(config, "github")
        assert len(result) == 1
        assert result[0]["name"] == "GitHub"

        result = search_links(config, "api")
        assert len(result) == 1
        assert result[0]["name"] == "Docs"

    def test_search_links_no_match(self):
        from link_manager.links import search_links

        config = {"links": [{"name": "A", "url": "https://a.com"}]}
        result = search_links(config, "nonexistent")
        assert result == []

    def test_get_link_found(self):
        from link_manager.links import get_link

        config = {"links": [{"name": "Test", "url": "https://test.com"}]}
        result = get_link(config, "Test")
        assert result is not None
        assert result["url"] == "https://test.com"

    def test_get_link_not_found(self):
        from link_manager.links import get_link

        result = get_link({}, "missing")
        assert result is None

    def test_list_categories(self):
        from link_manager.links import list_categories

        config = {
            "links": [
                {"name": "A", "url": "https://a.com", "category": "dev"},
                {"name": "B", "url": "https://b.com", "category": "dev"},
                {"name": "C", "url": "https://c.com", "category": "docs"},
            ]
        }
        result = list_categories(config)
        assert len(result) == 2
        assert result[0]["category"] == "dev"
        assert result[0]["count"] == 2

    def test_add_link(self):
        from link_manager.links import add_link

        config = {}
        link = add_link(config, "New", "https://new.com", category="dev")
        assert link["name"] == "New"
        assert len(config["links"]) == 1

    def test_remove_link(self):
        from link_manager.links import remove_link

        config = {"links": [{"name": "X", "url": "https://x.com"}]}
        assert remove_link(config, "X") is True
        assert len(config["links"]) == 0

    def test_remove_link_not_found(self):
        from link_manager.links import remove_link

        assert remove_link({}, "missing") is False
