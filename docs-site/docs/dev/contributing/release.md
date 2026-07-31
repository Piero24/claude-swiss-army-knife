---
sidebar_position: 5
---

# Release Process

How releases are versioned, tagged, and distributed.

## Versioning

This project uses calendar-based versioning with semver semantics:

- `v1.0.0` → `v1.1.0` → `v1.2.0`

Docker images are tagged with the version:

```bash
UBUNTU_MCP_IMAGE_TAG=v1.2.0
OBSIDIAN_MCP_IMAGE_TAG=v1.2.0
```

## Creating a Release

1. Update version references in documentation
2. Tag the commit:
   ```bash
   git tag -a v1.2.0 -m "Release v1.2.0"
   git push origin v1.2.0
   ```
3. Build and push Docker images:
   ```bash
   docker compose build
   docker tag ubuntu-mcp:latest ghcr.io/Piero24/ubuntu-mcp:v1.2.0
   docker push ghcr.io/Piero24/ubuntu-mcp:v1.2.0
   ```
4. Create a GitHub Release with changelog notes

## Changelog

Keep a changelog for each release:

```markdown
## v1.2.0 (2026-01-15)

### Added
- GitHub MCP proxy with tool-level permission gating
- Folder tree view in Web UI with cascade updates
- CasaOS deployment Compose file

### Changed
- Permission engine: explicit deny rules now take priority
- Web UI: improved audit log filtering

### Fixed
- Path traversal detection in safe_resolve_path
- Hot reload race condition on rapid config changes
```
