---
sidebar_position: 3
---

# Building & Deploying Docs

How to build and deploy the Docusaurus documentation site.

## Local Development

```bash
cd docs-site
npm install
npm run start     # Starts dev server at http://localhost:3000
```

The dev server supports hot reload for `.md` and `.mdx` files.

## Production Build

```bash
cd docs-site
npm run build     # Outputs to docs-site/build/
```

The build output is a static site. Verify it locally:

```bash
npm run serve     # Serves the build/ directory
```

## Deployment

The docs site is automatically deployed to GitHub Pages via `.github/workflows/deploy-docs.yml`:

1. Triggered on push to `main` that changes files in `docs-site/`
2. Checks out code, installs Node.js 22
3. Runs `npm ci && npm run build`
4. Deploys `build/` to the `gh-pages` branch

The site is served at `https://Piero24.github.io/claude-swiss-army-knife/`.

## Docker Build

The docs site can also run as a Docker container:

```bash
docker compose up -d --build docs-site
```

This serves the docs on port 3000.
