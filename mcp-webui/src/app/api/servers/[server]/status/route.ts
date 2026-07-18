/** PATCH per-server enabled/disabled status in settings.json */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";

const SETTINGS_PATH = process.env.CONFIGS_PATH
  ? path.join(process.env.CONFIGS_PATH, "settings.json")
  : "/app/configs/settings.json";

// Server names are dynamic — validated by path traversal check

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  if (server.includes("..") || server.includes("/")) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { enabled } = bodySchema.parse(body);

    // Read existing settings or create defaults
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
    const servers = settings.servers as Record<string, unknown>;
    servers[server] = { ...(servers[server] as Record<string, unknown> || {}), enabled };

    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");

    return NextResponse.json({ server, enabled });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
