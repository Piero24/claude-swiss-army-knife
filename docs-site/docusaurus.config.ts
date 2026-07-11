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
        { to: "/intro", label: "Introduction", position: "left" },
        { to: "/mcp-servers/overview", label: "MCP Servers", position: "left" },
        { to: "/webui/overview", label: "Web UI", position: "left" },
        { to: "/security/model", label: "Security", position: "left" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        { title: "Docs", items: [
          { label: "Introduction", to: "/intro" },
          { label: "Getting Started", to: "/getting-started/installation" },
        ]},
        { title: "Reference", items: [
          { label: "Ubuntu MCP", to: "/mcp-servers/ubuntu-server" },
          { label: "Obsidian MCP", to: "/mcp-servers/obsidian" },
          { label: "Synology MCP", to: "/mcp-servers/synology-nas" },
        ]},
      ],
      copyright: "Built with Docusaurus",
    },
    prism: { theme: themes.github, darkTheme: themes.dracula },
  },
};

export default config;
