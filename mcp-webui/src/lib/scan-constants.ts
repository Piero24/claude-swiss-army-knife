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
  // macOS bundles / packages (treated as files, not folders)
  "*.app", "*.pkg", "*.bundle", "*.framework",
  "*.xcodeproj", "*.xcworkspace", "*.kext",
];

/** Maximum concurrent DSM API calls during a scan. */
export const SCAN_CONCURRENCY = 2;

/** Delay between DSM requests (ms) to avoid overwhelming the NAS. */
export const SCAN_DELAY_MS = 100;

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
