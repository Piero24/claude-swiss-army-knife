import * as path from "path";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

/**
 * Resolve the YAML config file path for a given MCP server.
 * Server name is dynamic — validated by file existence at runtime.
 */
export function getConfigPath(server: string): string {
  // Prevent path traversal attacks
  if (server.includes("..") || server.includes("/") || server.includes("\\")) {
    throw new Error(`Invalid server name: ${server}`);
  }
  return path.join(CONFIGS_PATH, `${server}.yaml`);
}
