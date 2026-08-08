"""Gateway constants — target container endpoint candidate mappings."""

CONTAINER_TARGETS = {
    "ubuntu-server": [
        "http://ubuntu-mcp:8000",
        "http://ubuntu-server:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "ubuntu-mcp": [
        "http://ubuntu-mcp:8000",
        "http://ubuntu-server:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "obsidian": [
        "http://obsidian-mcp:8000",
        "http://obsidian:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "obsidian-mcp": [
        "http://obsidian-mcp:8000",
        "http://obsidian:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "synology-nas": [
        "http://synology-mcp:8000",
        "http://synology-nas:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "synology-mcp": [
        "http://synology-mcp:8000",
        "http://synology-nas:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "github": [
        "http://github-mcp:8000",
        "http://github:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "github-mcp": [
        "http://github-mcp:8000",
        "http://github:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "link-manager": [
        "http://link-manager-mcp:8000",
        "http://link-manager:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
    "link-manager-mcp": [
        "http://link-manager-mcp:8000",
        "http://link-manager:8000",
        "http://host.docker.internal:8000",
        "http://172.17.0.1:8000",
    ],
}
