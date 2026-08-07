/** POST /api/servers/bulk-status — atomically enable or disable all servers in settings.json */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";

const SETTINGS_PATH = process.env.CONFIGS_PATH
  ? path.join(process.env.CONFIGS_PATH, "settings.json")
  : "/app/configs/settings.json";

const bodySchema = z.object({
  enabled: z.boolean(),
});

const ALL_SERVERS = ["ubuntu-server", "obsidian", "synology-nas", "github-mcp", "link-manager-mcp"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enabled } = bodySchema.parse(body);

    let settings: Record<string, unknown>;
    try {
      const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
      settings = JSON.parse(raw);
    } catch {
      settings = {};
    }

    if (!settings.servers || typeof settings.servers !== "object") {
      settings.servers = {};
    }
    const serversMap = settings.servers as Record<string, Record<string, unknown>>;

    for (const serverName of ALL_SERVERS) {
      serversMap[serverName] = { ...(serversMap[serverName] || {}), enabled };
    }

    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");

    return NextResponse.json({ enabled, servers: ALL_SERVERS });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
