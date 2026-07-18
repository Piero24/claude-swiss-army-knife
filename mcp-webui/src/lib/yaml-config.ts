import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "./config";

/** Reads a server's YAML configuration file into a generic object */
export async function readServerConfig(server: string): Promise<Record<string, any>> {
  const filePath = getConfigPath(server);
  const raw = await fs.readFile(filePath, "utf-8");
  return yaml.load(raw) as Record<string, any>;
}

/** Writes a configuration object back to a server's YAML file */
export async function writeServerConfig(server: string, config: Record<string, any>): Promise<void> {
  const filePath = getConfigPath(server);
  const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
  await fs.writeFile(filePath, yamlStr, "utf-8");
}

/** 
 * Atomically reads, mutates via callback, and writes back the configuration.
 * The callback can return any type T, which will be returned by this function.
 * E.g., returning the mutated subset of the config.
 */
export async function withServerConfig<T>(
  server: string,
  fn: (config: Record<string, any>) => T | Promise<T>
): Promise<T> {
  const config = await readServerConfig(server);
  const result = await fn(config);
  await writeServerConfig(server, config);
  return result;
}
