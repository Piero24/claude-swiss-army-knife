/** GET — paginated audit log entries for a server. */

import { NextResponse } from "next/server";
import * as path from "path";
import { readAuditLogs } from "@/lib/audit-log-reader";

const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  if (server.includes("..") || server.includes("/")) {
    return NextResponse.json({ error: "Invalid server" }, { status: 400 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

  try {
    const logDirName = server.replace(/-server$/, "").replace(/-mcp$/, "");
    const logDir = path.join(LOGS_PATH, logDirName);
    const result = await readAuditLogs(logDir, { limit, offset });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ entries: [], total: 0 });
  }
}
