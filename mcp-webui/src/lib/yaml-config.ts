import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerConfigObject = Record<string, any>;

/** Reads a server's YAML configuration file into a generic object */
export async function readServerConfig(
  server: string,
  userId?: string
): Promise<ServerConfigObject> {
  const filePath = getConfigPath(server, userId);
  console.debug(`[config] Reading ${filePath}`);
  const raw = await fs.readFile(filePath, "utf-8");
  const config = (yaml.load(raw) as ServerConfigObject) || {};
  const pathCount = Array.isArray(config?.permissions?.paths)
    ? config.permissions.paths.length : 0;
  console.debug(`[config] Loaded ${server} (${pathCount} paths, user=${userId || "default"})`);
  return config;
}

/** Writes a configuration object back to a server's YAML file */
export async function writeServerConfig(
  server: string,
  config: ServerConfigObject,
  userId?: string
): Promise<void> {
  const filePath = getConfigPath(server, userId);
  const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
  await fs.writeFile(filePath, yamlStr, "utf-8");
  console.debug(`[config] Written ${server} (user=${userId || "default"}, ${yamlStr.length} bytes)`);
}

/**
 * Atomically reads, mutates via callback, and writes back the configuration.
 */
export async function withServerConfig<T>(
  server: string,
  fn: (config: ServerConfigObject) => T | Promise<T>,
  userId?: string
): Promise<T> {
  const config = await readServerConfig(server, userId);
  const result = await fn(config);
  await writeServerConfig(server, config, userId);
  return result;
}
