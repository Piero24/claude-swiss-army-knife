import * as path from "path";
import * as fs from "fs";
import * as fsPromises from "fs/promises";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

/**
 * Resolve the YAML config file path for a given MCP server and optional user.
 * With a userId: configs/<server>/<userId>.yaml
 * Without: inspects configs/<server>/ for available user configs, or falls back safely.
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

  // Fallback when userId is omitted:
  // 1. Check if legacy single-tenant file exists
  const legacyPath = path.join(CONFIGS_PATH, `${server}.yaml`);
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }

  // 2. Check if server directory exists with user files
  const serverDir = path.join(CONFIGS_PATH, server);
  if (fs.existsSync(serverDir)) {
    try {
      const files = fs.readdirSync(serverDir).filter((f) => f.endsWith(".yaml"));
      if (files.length > 0) {
        return path.join(serverDir, files[0]);
      }
    } catch { /* empty */ }
  }

  // 3. Template directory check
  let templateDir = "/app/templates";
  if (!fs.existsSync(templateDir)) {
    templateDir = path.join(CONFIGS_PATH, "templates");
  }
  const templatePath = path.join(templateDir, `${server}.yaml`);
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }

  return path.join(serverDir, "default.yaml");
}

/**
 * Get all user YAML config file paths for a given server directory.
 */
export async function getAllUserConfigPaths(server: string): Promise<string[]> {
  const serverDir = path.join(CONFIGS_PATH, server);
  try {
    const files = await fsPromises.readdir(serverDir);
    const yamlFiles = files.filter((f) => f.endsWith(".yaml")).map((f) => path.join(serverDir, f));
    if (yamlFiles.length > 0) return yamlFiles;
  } catch { /* empty */ }

  const fallback = getConfigPath(server);
  return [fallback];
}
