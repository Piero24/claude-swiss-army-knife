/** Shared audit log reader — reads active + rotated log files from a directory. */

import * as fs from "fs/promises";
import * as path from "path";

export interface AuditEntry {
  ts: string;
  server: string;
  target_type: string;
  target: string;
  result: string;
  access?: string;
  granted?: string;
  reason?: string;
  tool?: string;
  user_id?: string;
  subagent_id?: string;
}

/** Parsed entry with its source file preserved (for debugging). */
interface ParsedEntry {
  entry: AuditEntry;
  ts: Date;
}

const AUDIT_FILE_PATTERN = /^audit-\d{4}-\d{2}\.log$/;

/**
 * Read all audit entries from a log directory.
 *
 * Reads the active ``audit.log`` and any rotated ``audit-YYYY-MM.log`` files,
 * merges them, and returns entries sorted newest-first.
 */
export async function readAuditLogs(
  logDir: string,
  options?: { limit?: number; offset?: number },
): Promise<{ entries: AuditEntry[]; total: number }> {
  const limit = Math.min(options?.limit ?? 50, 500);
  const offset = Math.max(options?.offset ?? 0, 0);

  let allFiles: string[] = [];
  try {
    const dirents = await fs.readdir(logDir, { withFileTypes: true });
    allFiles = dirents
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .filter(
        (name) =>
          name === "audit.log" || AUDIT_FILE_PATTERN.test(name),
      );
  } catch {
    return { entries: [], total: 0 };
  }

  // Sort: rotated files by month descending, active file last (most recent)
  allFiles.sort((a, b) => {
    if (a === "audit.log") return 1;
    if (b === "audit.log") return -1;
    return b.localeCompare(a); // "audit-2026-08.log" > "audit-2026-07.log"
  });

  const allEntries: ParsedEntry[] = [];

  for (const filename of allFiles) {
    const filePath = path.join(logDir, filename);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    if (!raw.trim()) continue;

    const lines = raw.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      try {
        const entry: AuditEntry = JSON.parse(line);
        if (!entry.ts) continue;
        const ts = new Date(entry.ts);
        if (!isNaN(ts.getTime())) {
          allEntries.push({ entry, ts });
        }
      } catch {
        /* skip malformed lines */
      }
    }
  }

  // Sort newest first
  allEntries.sort((a, b) => b.ts.getTime() - a.ts.getTime());

  return {
    entries: allEntries.slice(offset, offset + limit).map((e) => e.entry),
    total: allEntries.length,
  };
}

/**
 * Read all raw entries from a log directory for bulk processing (stats, agents).
 * Returns all entries unsorted for caller-side aggregation.
 */
export async function readAllAuditEntries(
  logDir: string,
  maxLinesPerFile = 2000,
): Promise<AuditEntry[]> {
  let allFiles: string[] = [];
  try {
    const dirents = await fs.readdir(logDir, { withFileTypes: true });
    allFiles = dirents
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .filter(
        (name) =>
          name === "audit.log" || AUDIT_FILE_PATTERN.test(name),
      );
  } catch {
    return [];
  }

  const entries: AuditEntry[] = [];

  for (const filename of allFiles) {
    const filePath = path.join(logDir, filename);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    if (!raw.trim()) continue;

    const lines = raw.split("\n").filter(Boolean);
    // Take the most recent lines from each file for performance
    const recent = lines.slice(-maxLinesPerFile);
    for (const line of recent) {
      try {
        const entry: AuditEntry = JSON.parse(line);
        if (entry.ts) entries.push(entry);
      } catch {
        /* skip malformed lines */
      }
    }
  }

  return entries;
}
