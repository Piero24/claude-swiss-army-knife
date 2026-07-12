/** Shared scan configuration — single source of truth for exclude patterns,
 *  concurrency limits, and the isExcluded helper used by both the scan
 *  API route and the folder-tree route. */

import { readFileSync } from "fs";
import path from "path";

/** Canonical default exclude patterns (folder-name exact match). */
export const DEFAULT_EXCLUDES: readonly string[] = [
  ".venv", "venv", "__pycache__", ".git", "node_modules",
  ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
  "lost+found", ".Trash", "#recycle", "@eaDir",
];

/** Maximum concurrent DSM API calls during a scan. */
export const SCAN_CONCURRENCY = 6;

/** Maximum folder depth for recursive scan (safety limit). */
export const SCAN_MAX_DEPTH = 20;

/**
 * Read exclude patterns from settings.json and MERGE with defaults.
 * User-provided patterns EXTEND the built-in list (never replace it).
 * Falls back to defaults if settings.json is missing or unreadable.
 */
export function getExcludePatterns(): string[] {
  try {
    const settingsDir = process.env.CONFIGS_PATH || "/app/configs";
    const raw = readFileSync(path.join(settingsDir, "settings.json"), "utf-8");
    const settings = JSON.parse(raw);
    const userPatterns: unknown = settings.scan?.excludePatterns;
    if (Array.isArray(userPatterns) && userPatterns.length > 0) {
      // Merge: defaults first, user patterns appended, dedup via Set
      const merged = [...DEFAULT_EXCLUDES, ...(userPatterns as string[])];
      return [...new Set(merged)];
    }
  } catch {
    // settings.json missing or unreadable — use defaults
  }
  return [...DEFAULT_EXCLUDES];
}

/** Check whether a path should be excluded (exact match on last component). */
export function isExcluded(p: string): boolean {
  const name = p.split("/").filter(Boolean).pop() || p;
  return getExcludePatterns().some((pattern) => name === pattern);
}
