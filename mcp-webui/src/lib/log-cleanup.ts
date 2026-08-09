/** Monthly log rotation and retention cleanup for MCP audit logs.

 *  Rotation: if ``audit.log`` contains entries from a previous month,
 *  it is renamed to ``audit-YYYY-MM.log``.  The active ``audit.log``
 *  is *never* deleted — only rotated archive files are cleaned up.
 *
 *  Retention: archive files older than ``logRetentionMonths``
 *  (read from settings.json) are deleted.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";
const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

/** Matches ``audit-2026-08.log`` — rotated archive files. */
const ARCHIVE_PATTERN = /^audit-(\d{4})-(\d{2})\.log$/;

// ── helpers ──────────────────────────────────────────────────────────────

/** Read retention months from settings.json. Returns 12 if unreadable. */
async function getRetentionMonths(): Promise<number> {
  try {
    const raw = await fs.readFile(
      path.join(CONFIGS_PATH, "settings.json"),
      "utf-8",
    );
    const settings = JSON.parse(raw);
    const months = settings.logRetentionMonths;
    if (typeof months === "number" && months >= 1 && months <= 60) {
      return months;
    }
  } catch {
    /* settings.json missing or unreadable */
  }
  return 12; // default: 1 year
}

/** Parse a month key like "2026-08" into a Date (1st of the month). */
function monthToDate(monthKey: string): Date | null {
  const parts = monthKey.split("-");
  if (parts.length !== 2) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

/** Get the current month key (e.g. "2026-08"). */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Get the cutoff date: first day of the month *retentionMonths* ago. */
function cutoffDate(retentionMonths: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - retentionMonths, 1);
}

// ── rotation ─────────────────────────────────────────────────────────────

/**
 * Rotate audit.log if it contains entries from a previous month.
 *
 * Reads the last line of ``audit.log`` (most recent entry), extracts its
 * month, and if that month is before the current month, renames the file
 * to ``audit-YYYY-MM.log``.  A new ``audit.log`` will be created on the
 * next permission check.
 */
export async function rotateMonthlyLogs(): Promise<{
  rotated: string[];
}> {
  const rotated: string[] = [];
  const thisMonth = currentMonthKey();

  let dirs: fsSync.Dirent[] = [];
  try {
    dirs = await fs.readdir(LOGS_PATH, { withFileTypes: true });
  } catch {
    console.warn("[log-cleanup] LOGS_PATH not found:", LOGS_PATH);
    return { rotated };
  }

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const logDir = path.join(LOGS_PATH, dirent.name);
    const logFile = path.join(logDir, "audit.log");

    let stat: { size: number };
    try {
      stat = await fs.stat(logFile);
    } catch {
      continue; // no active log file
    }
    if (stat.size === 0) continue;

    // Read the last ~512 bytes to find the most recent entry's month
    let chunk: string;
    try {
      const fd = await fs.open(logFile, "r");
      const buf = Buffer.alloc(512);
      const start = Math.max(0, stat.size - 512);
      await fd.read(buf, 0, 512, start);
      await fd.close();
      chunk = buf.toString("utf-8");
    } catch {
      continue;
    }

    // Extract the newest entry's timestamp from the last line
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    let latestMonth: string | null = null;
    // Walk lines backwards to find the newest valid entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.ts && entry.ts.length >= 7) {
          latestMonth = entry.ts.slice(0, 7); // "2026-08"
          break;
        }
      } catch {
        continue;
      }
    }

    if (!latestMonth || latestMonth >= thisMonth) continue;

    // Rotate: the entire file belongs to one past month
    // Find the oldest entry's month to name the archive correctly
    let oldestMonth: string | null = null;
    // If the file is small enough, read it all to find the oldest month
    if (stat.size < 1024 * 1024) {
      // Under 1 MB — read whole file
      try {
        const full = await fs.readFile(logFile, "utf-8");
        for (const line of full.split("\n")) {
          try {
            const entry = JSON.parse(line);
            if (entry.ts && entry.ts.length >= 7) {
              oldestMonth = entry.ts.slice(0, 7);
              break; // first valid line = oldest
            }
          } catch { continue; }
        }
      } catch { /* skip */ }
    }

    const archiveMonth = oldestMonth || latestMonth;
    const archiveName = `audit-${archiveMonth}.log`;
    const archivePath = path.join(logDir, archiveName);

    try {
      await fs.rename(logFile, archivePath);
      console.info(
        `[log-cleanup] Rotated ${dirent.name}/audit.log → ${archiveName}`,
      );
      rotated.push(`${dirent.name}/${archiveName}`);
    } catch (err) {
      console.error(
        `[log-cleanup] Failed to rotate ${dirent.name}/audit.log:`,
        err,
      );
    }
  }

  return { rotated };
}

// ── cleanup ──────────────────────────────────────────────────────────────

/**
 * Delete rotated archive files older than the configured retention period.
 *
 * Only deletes ``audit-YYYY-MM.log`` files — the active ``audit.log``
 * is never touched.
 */
export async function cleanupOldLogs(): Promise<{
  deleted: number;
  kept: number;
  retentionMonths: number;
}> {
  const retentionMonths = await getRetentionMonths();
  const cutoff = cutoffDate(retentionMonths);
  let deleted = 0;
  let kept = 0;

  let dirs: fsSync.Dirent[] = [];
  try {
    dirs = await fs.readdir(LOGS_PATH, { withFileTypes: true });
  } catch {
    return { deleted, kept, retentionMonths };
  }

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const logDir = path.join(LOGS_PATH, dirent.name);

    let files: string[] = [];
    try {
      files = await fs.readdir(logDir);
    } catch {
      continue;
    }

    for (const filename of files) {
      const match = ARCHIVE_PATTERN.exec(filename);
      if (!match) continue; // skip audit.log and non-matching files

      const monthKey = `${match[1]}-${match[2]}`;
      const fileDate = monthToDate(monthKey);
      if (!fileDate) continue;

      if (fileDate < cutoff) {
        try {
          await fs.unlink(path.join(logDir, filename));
          deleted++;
          console.info(
            `[log-cleanup] Deleted ${dirent.name}/${filename} (older than ${retentionMonths} months)`,
          );
        } catch (err) {
          console.error(
            `[log-cleanup] Failed to delete ${dirent.name}/${filename}:`,
            err,
          );
        }
      } else {
        kept++;
      }
    }
  }

  if (deleted > 0 || kept > 0) {
    console.info(
      `[log-cleanup] Cleanup done: ${deleted} deleted, ${kept} kept (retention: ${retentionMonths} months)`,
    );
  }

  return { deleted, kept, retentionMonths };
}

/**
 * Run both rotation and cleanup in one call — used by the daily scheduler.
 */
export async function runLogMaintenance(): Promise<void> {
  console.info("[log-cleanup] Starting log maintenance…");
  await rotateMonthlyLogs();
  await cleanupOldLogs();
}
