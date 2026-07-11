import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: ["getting-started/prerequisites", "getting-started/installation", "getting-started/claude-code-setup"],
    },
    {
      type: "category",
      label: "MCP Servers",
      items: ["mcp-servers/overview", "mcp-servers/ubuntu-server", "mcp-servers/obsidian", "mcp-servers/synology-nas"],
    },
    {
      type: "category",
      label: "Web UI",
      items: ["webui/overview", "webui/usage"],
    },
    {
      type: "category",
      label: "Security",
      items: ["security/model", "security/permissions", "security/hardening"],
    },
    {
      type: "category",
      label: "Deployment",
      items: ["deployment/docker-compose", "deployment/cloudflare-tunnel", "deployment/production"],
    },
  ],
};

export default sidebars;
