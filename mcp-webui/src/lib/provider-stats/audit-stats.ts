/** Computes enhanced stats from existing MCP audit logs.
 *  Extracted from src/app/api/stats/route.ts with added metrics. */

import * as fs from "fs/promises";
import path from "path";
import { normalizeServer } from "./server-labels";
import { readAllAuditEntries } from "@/lib/audit-log-reader";

const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";
const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

export interface AuditStats {
  totals: { all_time: number; today: number; this_week: number };
  by_server: Record<string, number>;
  by_tool: Array<{ name: string; count: number }>;
  by_day: Array<{ date: string; count: number }>;
  result_ratio: { allowed: number; denied: number };
  by_user: Array<{ user_id: string; user_name: string; count: number }>;
  top_denied: Array<{ target: string; count: number }>;
}

/** Build a user_id → user_name map from users.yaml. */
async function getUserNameMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const raw = await fs.readFile(path.join(CONFIGS_PATH, "users.yaml"), "utf-8");
    // Simple YAML parsing for the users list — avoids pulling js-yaml here
    const lines = raw.split("\n");
    let currentId = "";
    for (const line of lines) {
      const idMatch = line.match(/^\s{2,4}-\s+id:\s*["']?(.+?)["']?\s*$/);
      if (idMatch) { currentId = idMatch[1].trim(); continue; }
      if (currentId) {
        const nameMatch = line.match(/^\s{4,6}name:\s*["']?(.+?)["']?\s*$/);
        if (nameMatch) { map[currentId] = nameMatch[1].trim(); currentId = ""; }
      }
    }
  } catch { /* users.yaml not available — names will fall back to IDs */ }
  return map;
}

export async function computeAuditStats(
  serverFilter?: string
): Promise<AuditStats> {
  const userNameMap = await getUserNameMap();
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const byServer: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byDenied: Record<string, number> = {};
  const resultRatio = { allowed: 0, denied: 0 };

  let allTime = 0;
  let todayCount = 0;
  let thisWeek = 0;

  try {
    const dirs = await fs.readdir(LOGS_PATH, { withFileTypes: true });
    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;
      // If server filter is set, skip directories that don't match
      if (serverFilter && dirent.name !== serverFilter) continue;
      const logDir = path.join(LOGS_PATH, dirent.name);
      // Quick existence check before scanning all files
      try { await fs.access(path.join(logDir, "audit.log")); } catch { continue; }

      const entries = await readAllAuditEntries(
        path.join(LOGS_PATH, dirent.name),
        2000,
      );
      for (const entry of entries) {
        if (!entry.ts) continue;

        allTime++;

        const ts = new Date(entry.ts);
        if (!isNaN(ts.getTime())) {
          if (ts >= todayStart) todayCount++;
          if (ts >= weekStart) thisWeek++;

          const dayKey = ts.toISOString().slice(0, 10);
          byDay[dayKey] = (byDay[dayKey] || 0) + 1;
        }

        // By server — normalize to canonical key
        const rawServer = entry.server || dirent.name;
        const server = normalizeServer(rawServer);
        byServer[server] = (byServer[server] || 0) + 1;

        // By tool
        const tool = entry.target || null;
        if (tool) {
          byTool[tool] = (byTool[tool] || 0) + 1;
        }

        // By user — label unauthenticated traffic as "anonymous"
        const rawUserId = entry.user_id || "default";
        const userId = rawUserId === "default" ? "anonymous" : rawUserId;
        byUser[userId] = (byUser[userId] || 0) + 1;

        // Result ratio
        if (entry.result === "allowed") {
          resultRatio.allowed++;
        } else {
          resultRatio.denied++;
          // Track denied targets
          if (tool) {
            byDenied[tool] = (byDenied[tool] || 0) + 1;
          }
        }
      }
    }
  } catch {
    /* log dir may not exist yet */
  }

  // Sort tools by count desc, top 20
  const topTools = Object.entries(byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  // Sort and pad days — fill zeroes from first entry to today
  const todayStr = now.toISOString().slice(0, 10);
  const dayEntries = Object.entries(byDay);
  let firstDate = todayStr;
  if (dayEntries.length > 0) {
    dayEntries.sort((a, b) => a[0].localeCompare(b[0]));
    firstDate = dayEntries[0][0];
  }
  const sortedDays: Array<{ date: string; count: number }> = [];
  const cursor = new Date(firstDate + "T00:00:00Z");
  const end = new Date(todayStr + "T00:00:00Z");
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    sortedDays.push({ date: key, count: byDay[key] || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Top users — include display names from users.yaml
  const topUsers = Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user_id, count]) => ({
      user_id,
      user_name: userNameMap[user_id] || user_id,
      count,
    }));

  // Top denied targets
  const topDenied = Object.entries(byDenied)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([target, count]) => ({ target, count }));

  return {
    totals: { all_time: allTime, today: todayCount, this_week: thisWeek },
    by_server: byServer,
    by_tool: topTools,
    by_day: sortedDays,
    result_ratio: resultRatio,
    by_user: topUsers,
    top_denied: topDenied,
  };
}
