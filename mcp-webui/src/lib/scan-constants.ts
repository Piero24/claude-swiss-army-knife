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

/**
 * Read scan timeout in seconds from settings.json.
 * Defaults to -1 (unlimited scan time until complete).
 * If > 0, scan times out after max that many seconds.
 */
export function getScanTimeoutSeconds(): number {
  try {
    const settingsDir = process.env.CONFIGS_PATH || "/app/configs";
    const raw = readFileSync(path.join(settingsDir, "settings.json"), "utf-8");
    const settings = JSON.parse(raw);
    if (typeof settings.scan?.timeoutSeconds === "number") {
      return settings.scan.timeoutSeconds;
    }
  } catch {
    // settings.json missing or unreadable — default to unlimited (-1)
  }
  return -1;
}

/** Check whether a path should be excluded.
 *
 *  Supported patterns:
 *    exact       → "node_modules" matches only "node_modules"
 *    *.ext       → "*.app" matches "Foo.app", "bar.app"
 *    prefix-*    → "frrncl-*" matches "frrncl-data", "frrncl-logs"
 *    *suffix     → "*-old" matches "backup-old", "data-old"
 *    *contains*  → "*cache*" matches ".cache", "my-cache-dir"
 */
export function isExcluded(p: string): boolean {
  const name = p.split("/").filter(Boolean).pop() || p;
  return getExcludePatterns().some((pattern) => {
    // *contains* — wildcard on both sides
    if (pattern.startsWith("*") && pattern.endsWith("*") && pattern.length > 2) {
      const middle = pattern.slice(1, -1);
      return name.includes(middle);
    }
    // *.ext — suffix match
    if (pattern.startsWith("*.")) {
      return name.endsWith(pattern.slice(1));
    }
    // prefix-* — prefix match
    if (pattern.endsWith("*") && pattern.length > 1) {
      return name.startsWith(pattern.slice(0, -1));
    }
    // *suffix — suffix match (single leading *)
    if (pattern.startsWith("*") && pattern.length > 1) {
      return name.endsWith(pattern.slice(1));
    }
    // exact match
    return name === pattern;
  });
}
