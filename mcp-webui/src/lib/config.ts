import * as path from "path";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

/**
 * Resolve the YAML config file path for a given MCP server and optional user.
 * With a userId: configs/<server>/<userId>.yaml
 * Without: configs/<server>.yaml (legacy/old format)
 */
export function getConfigPath(server: string, userId?: string): string {
  if (server.includes("..") || server.includes("/") || server.includes("\\")) {
    throw new Error(`Invalid server name: ${server}`);
  }
  if (userId) {
    if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) {
      throw new Error(`Invalid user ID: ${userId}`);
    }
    return path.join(CONFIGS_PATH, server, `${userId}.yaml`);
  }
  return path.join(CONFIGS_PATH, `${server}.yaml`);
}
