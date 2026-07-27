import type { Config } from "@docusaurus/types";
import { themes } from "prism-react-renderer";

const config: Config = {
  title: "MCP Server Suite",
  tagline: "Professional MCP servers for Obsidian, Ubuntu, and Synology",
  url: "https://Piero24.github.io",
  baseUrl: "/claude-swiss-army-knife/",
  favicon: "img/favicon.ico",
  organizationName: "Piero24",
  projectName: "claude-swiss-army-knife",
  onBrokenLinks: "warn",

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
      onBrokenMarkdownImages: "warn",
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          showLastUpdateTime: true,
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: "MCP Suite Docs",
      items: [
        { to: "/user/intro", label: "Introduction", position: "left" },
        {
          type: "dropdown",
          label: "User Guide",
          position: "left",
          items: [
            { to: "/user/getting-started/installation", label: "Getting Started" },
            { to: "/user/mcp-servers/overview", label: "MCP Servers" },
            { to: "/user/webui/overview", label: "Web UI" },
            { to: "/user/security/model", label: "Security" },
            { to: "/user/deployment/docker-compose", label: "Deployment" },
            { to: "/user/troubleshooting/common-issues", label: "Troubleshooting" },
          ],
        },
        {
          type: "dropdown",
          label: "Developer Guide",
          position: "left",
          items: [
            { to: "/dev/architecture/system-design", label: "Architecture" },
            { to: "/dev/permission-engine/overview", label: "Permission Engine" },
            { to: "/dev/mcp-servers/base-server", label: "MCP Server Dev" },
            { to: "/dev/webui/tech-stack", label: "Web UI Dev" },
            { to: "/dev/contributing/dev-environment", label: "Contributing" },
          ],
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        { title: "User Guide", items: [
          { label: "Introduction", to: "/user/intro" },
          { label: "Getting Started", to: "/user/getting-started/installation" },
          { label: "Ubuntu MCP", to: "/user/mcp-servers/ubuntu-server" },
          { label: "Web UI", to: "/user/webui/overview" },
        ]},
        { title: "Developer Guide", items: [
          { label: "Architecture", to: "/dev/architecture/system-design" },
          { label: "Permission Engine", to: "/dev/permission-engine/overview" },
          { label: "Contributing", to: "/dev/contributing/dev-environment" },
        ]},
      ],
      copyright: "Built with Docusaurus",
    },
    prism: { theme: themes.github, darkTheme: themes.dracula },
  },
};

export default config;
