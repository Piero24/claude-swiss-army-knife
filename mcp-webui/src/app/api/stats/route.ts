/** GET — audit log statistics only. No external API keys required. */

import { NextResponse } from "next/server";
import { computeAuditStats } from "@/lib/provider-stats/audit-stats";
import { normalizeServer } from "@/lib/provider-stats/server-labels";

const CACHE_TTL = 60_000; // 60 seconds

let cache: { data: unknown; ts: number; day: number } | null = null;

function cacheValid(entry: typeof cache): boolean {
  if (!entry) return false;
  const now = Date.now();
  if (now - entry.ts >= CACHE_TTL) return false;
  // Invalidate at midnight so today/this_week stats refresh
  if (new Date(entry.ts).getDate() !== new Date().getDate()) return false;
  return true;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawServer = searchParams.get("server") || undefined;

  // Normalize to canonical key so it matches log directory names
  const serverFilter = rawServer ? normalizeServer(rawServer) : undefined;

  if (serverFilter) {
    return NextResponse.json(await computeAuditStats(serverFilter));
  }

  const now = Date.now();

  if (cacheValid(cache)) {
    return NextResponse.json(cache!.data);
  }

  const stats = await computeAuditStats();
  cache = { data: stats, ts: now, day: new Date().getDate() };
  return NextResponse.json(stats);
}
