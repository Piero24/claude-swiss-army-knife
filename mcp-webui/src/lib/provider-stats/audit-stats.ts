/** Computes enhanced stats from existing MCP audit logs.
 *  Extracted from src/app/api/stats/route.ts with added metrics. */

import * as fs from "fs/promises";
import path from "path";

const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";

export interface AuditStats {
  totals: { all_time: number; today: number; this_week: number };
  by_server: Record<string, number>;
  by_tool: Array<{ name: string; count: number }>;
  by_day: Array<{ date: string; count: number }>;
  result_ratio: { allowed: number; denied: number };
  by_user: Array<{ user_id: string; count: number }>;
  top_denied: Array<{ target: string; count: number }>;
}

export async function computeAuditStats(
  serverFilter?: string
): Promise<AuditStats> {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const weekStart = new Date(
    todayStart.getTime() - 7 * 24 * 60 * 60 * 1000
  );

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
      const logFile = path.join(LOGS_PATH, dirent.name, "audit.log");
      const raw = await fs.readFile(logFile, "utf-8").catch(() => "");
      if (!raw) continue;

      const lines = raw.split("\n").filter(Boolean);
      // Scan last 2000 entries per server for performance
      const recent = lines.slice(-2000);
      for (const line of recent) {
        try {
          const entry = JSON.parse(line);
          if (!entry.ts) continue;

          allTime++;

          const ts = new Date(entry.ts);
          if (!isNaN(ts.getTime())) {
            if (ts >= todayStart) todayCount++;
            if (ts >= weekStart) thisWeek++;

            const dayKey = ts.toISOString().slice(0, 10);
            byDay[dayKey] = (byDay[dayKey] || 0) + 1;
          }

          // By server
          const server = entry.server || dirent.name;
          byServer[server] = (byServer[server] || 0) + 1;

          // By tool
          const tool = entry.target || entry.command || null;
          if (tool) {
            byTool[tool] = (byTool[tool] || 0) + 1;
          }

          // By user
          const userId = entry.user_id || "default";
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
        } catch {
          /* skip malformed lines */
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

  // Sort days chronologically, last 7
  const sortedDays = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([date, count]) => ({ date, count }));

  // Top users
  const topUsers = Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user_id, count]) => ({ user_id, count }));

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
