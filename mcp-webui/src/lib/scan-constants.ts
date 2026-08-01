/** Shared scan configuration — single source of truth for exclude patterns,
 *  concurrency limits, and the isExcluded helper used by both the scan
 *  API route and the folder-tree route. */

import { readFileSync } from "fs";
import path from "path";

/** Default exclude patterns (starts empty unless specified in settings.json). */
export const DEFAULT_EXCLUDES: readonly string[] = [];

/** Maximum concurrent DSM API calls during a scan. */
export const SCAN_CONCURRENCY = 2;

/** Delay between DSM requests (ms) to avoid overwhelming the NAS. */
export const SCAN_DELAY_MS = 100;

/**
 * Read exclude patterns from settings.json if available.
 * Returns settings.scan.excludePatterns if present, else empty array.
 */
export function getExcludePatterns(): string[] {
  try {
    const settingsDir = process.env.CONFIGS_PATH || "/app/configs";
    const raw = readFileSync(path.join(settingsDir, "settings.json"), "utf-8");
    const settings = JSON.parse(raw);
    const userPatterns: unknown = settings.scan?.excludePatterns;
    if (Array.isArray(userPatterns)) {
      return [...new Set(userPatterns as string[])];
    }
  } catch {
    // settings.json missing or unreadable — leave empty
  }
  return [];
}

/** Check whether a path should be excluded. Supports exact name match and wildcard suffix (e.g. *.app). */
export function isExcluded(p: string): boolean {
  const name = p.split("/").filter(Boolean).pop() || p;
  return getExcludePatterns().some((pattern) => {
    if (pattern.startsWith("*.")) {
      return name.endsWith(pattern.slice(1)); // *.app matches Foo.app
    }
    return name === pattern; // exact folder name match
  });
}
