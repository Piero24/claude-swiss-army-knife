---
sidebar_position: 3
---

# CI/CD Pipeline

The project uses GitHub Actions for continuous integration and deployment.

## CI Workflow (`.github/workflows/ci.yml`)

Runs on every push and pull request to `main`:

| Job | What It Does |
|---|---|
| **Python Lint** | pylint on all Python source files |
| **Python Test** | pytest on the permission engine tests |
| **TypeScript Typecheck** | `tsc --noEmit` on the Web UI |
| **Web UI Test** | vitest on the Web UI |
| **Web UI Build** | `next build` to verify production build |
| **Docker Build** | Build all Dockerfiles to verify they work |

## Deploy Docs Workflow (`.github/workflows/deploy-docs.yml`)

Runs on pushes to `main` that change files in `docs-site/`:

1. Checkout code
2. Setup Node.js 22
3. `cd docs-site && npm ci && npm run build`
4. Deploy to GitHub Pages (`Piero24.github.io/claude-swiss-army-knife/`)

## Dependabot (`.github/dependabot.yml`)

Weekly dependency update checks for:
- **pip**: `mcp-servers/*/pyproject.toml`
- **npm**: `mcp-webui/package.json`, `docs-site/package.json`
- **GitHub Actions**: workflow files

## Local CI Verification

Before pushing, run the CI checks locally:

```bash
# Python
cd mcp-servers/shared/mcp-permission-engine && python -m pytest tests/ -v

# Web UI
cd mcp-webui && npm run typecheck && npm test && npm run build

# Docs
cd docs-site && npm run build
```
