/** GET — recent audit log entries for a server. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  const valid = ["ubuntu-server", "obsidian", "synology-nas"];
  if (!valid.includes(server)) {
    return NextResponse.json({ error: "Invalid server" }, { status: 400 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
  const filter = url.searchParams.get("filter"); // "allowed" | "denied" | null

  try {
    const logDir = path.join(LOGS_PATH, server === "synology-nas" ? "synology" : server === "ubuntu-server" ? "ubuntu" : "obsidian");
    const logFile = path.join(logDir, "audit.log");

    const raw = await fs.readFile(logFile, "utf-8").catch(() => "");
    if (!raw) return NextResponse.json([]);

    const entries = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .reverse();

    const filtered = filter ? entries.filter((e: any) => e.result === filter) : entries;
    return NextResponse.json(filtered.slice(0, limit));
  } catch {
    return NextResponse.json([]);
  }
}
