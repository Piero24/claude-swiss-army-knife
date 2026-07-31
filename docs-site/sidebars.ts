import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    {
      type: "category",
      label: "User Guide",
      link: { type: "doc", id: "user/intro" },
      items: [
        {
          type: "category",
          label: "Getting Started",
          items: [
            "user/getting-started/prerequisites",
            "user/getting-started/installation",
            "user/getting-started/configuration",
            "user/getting-started/claude-code-setup",
            "user/getting-started/verifying",
          ],
        },
        {
          type: "category",
          label: "MCP Servers",
          items: [
            "user/mcp-servers/overview",
            "user/mcp-servers/ubuntu-server",
            "user/mcp-servers/obsidian",
            "user/mcp-servers/synology-nas",
            "user/mcp-servers/github-mcp",
          ],
        },
        {
          type: "category",
          label: "Web UI Guide",
          items: [
            "user/webui/overview",
            "user/webui/dashboard",
            "user/webui/managing-permissions",
            "user/webui/agents",
            "user/webui/audit-logs",
            "user/webui/settings",
            "user/webui/login-security",
          ],
        },
        {
          type: "category",
          label: "Security",
          items: [
            "user/security/model",
            "user/security/permissions",
            "user/security/audit-trail",
            "user/security/hardening",
          ],
        },
        {
          type: "category",
          label: "Deployment",
          items: [
            "user/deployment/docker-compose",
            "user/deployment/casaos",
            "user/deployment/cloudflare-tunnel",
            "user/deployment/production",
          ],
        },
        {
          type: "category",
          label: "Troubleshooting",
          items: [
            "user/troubleshooting/common-issues",
            "user/troubleshooting/faq",
            "user/troubleshooting/getting-help",
          ],
        },
      ],
    },
    {
      type: "category",
      label: "Developer Guide",
      link: { type: "doc", id: "dev/architecture/system-design" },
      items: [
        {
          type: "category",
          label: "Architecture",
          items: [
            "dev/architecture/system-design",
            "dev/architecture/directory-structure",
            "dev/architecture/communication-flow",
          ],
        },
        {
          type: "category",
          label: "Permission Engine",
          items: [
            "dev/permission-engine/overview",
            "dev/permission-engine/access-levels",
            "dev/permission-engine/path-resolution",
            "dev/permission-engine/command-enforcement",
            "dev/permission-engine/tool-enforcement",
            "dev/permission-engine/user-authentication",
            "dev/permission-engine/audit-system",
            "dev/permission-engine/hot-reload",
          ],
        },
        {
          type: "category",
          label: "MCP Server Development",
          items: [
            "dev/mcp-servers/base-server",
            "dev/mcp-servers/building-new",
            "dev/mcp-servers/tool-definition",
            "dev/mcp-servers/path-mapper",
            "dev/mcp-servers/config-watcher",
            "dev/mcp-servers/testing",
          ],
        },
        {
          type: "category",
          label: "Proxy Server Framework",
          items: [
            "dev/proxy-server/architecture",
            "dev/proxy-server/hook-system",
            "dev/proxy-server/building-proxy",
            "dev/proxy-server/configuration",
          ],
        },
        {
          type: "category",
          label: "Web UI Development",
          items: [
            "dev/webui/tech-stack",
            "dev/webui/project-structure",
            "dev/webui/components",
            "dev/webui/api-routes",
            "dev/webui/auth-flow",
            "dev/webui/state-management",
            "dev/webui/testing",
          ],
        },
        {
          type: "category",
          label: "Docs Site Development",
          items: [
            "dev/docs-site/config",
            "dev/docs-site/adding-pages",
            "dev/docs-site/build-deploy",
          ],
        },
        {
          type: "category",
          label: "Contributing",
          items: [
            "dev/contributing/dev-environment",
            "dev/contributing/code-style",
            "dev/contributing/ci-cd",
            "dev/contributing/submitting",
            "dev/contributing/release",
          ],
        },
      ],
    },
  ],
};

export default sidebars;
