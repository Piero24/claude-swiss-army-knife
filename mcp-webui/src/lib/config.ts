import * as path from "path";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

/**
 * Resolve the YAML config file path for a given MCP server.
 * Validates the server name to prevent path traversal.
 */
export function getConfigPath(server: string): string {
  const valid = ["ubuntu-server", "obsidian", "synology-nas", "github-mcp"];
  if (!valid.includes(server)) {
    throw new Error(`Invalid server name: ${server}`);
  }
  return path.join(CONFIGS_PATH, `${server}.yaml`);
}
