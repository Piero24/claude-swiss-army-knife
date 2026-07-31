---
sidebar_position: 1
---

# Docusaurus Configuration

The documentation site is built with Docusaurus 3.

## Config File

`docs-site/docusaurus.config.ts`:

```typescript
const config: Config = {
  title: "MCP Server Suite",
  tagline: "Professional MCP servers for Obsidian, Ubuntu, and Synology",
  url: "https://Piero24.github.io",
  baseUrl: "/claude-swiss-army-knife/",
  favicon: "img/favicon.ico",
  organizationName: "Piero24",
  projectName: "claude-swiss-army-knife",

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",       // Docs served at root
          sidebarPath: "./sidebars.ts",
          showLastUpdateTime: true,
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
};
```

Key settings:
- `routeBasePath: "/"` means docs are at the site root (not `/docs/`)
- Docs are auto-deployed to GitHub Pages at `Piero24.github.io/claude-swiss-army-knife/`
- `showLastUpdateTime: true` shows last modification time on each page

## Sidebar Configuration

`docs-site/sidebars.ts` defines the documentation structure. It exports a `SidebarsConfig` object with a `docs` key containing the full tree. Categories can be nested arbitrarily.

See the current sidebar for the complete structure.

## Theme

The site uses the classic Docusaurus theme with Prism syntax highlighting:

```typescript
prism: {
  theme: themes.github,       // Light theme
  darkTheme: themes.dracula,  // Dark theme
}
```
