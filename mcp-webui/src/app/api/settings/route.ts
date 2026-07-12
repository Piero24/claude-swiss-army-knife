/** GET/PUT app settings from configs/settings.json */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";

const SETTINGS_PATH = process.env.CONFIGS_PATH
  ? path.join(process.env.CONFIGS_PATH, "settings.json")
  : "/app/configs/settings.json";

const settingsSchema = z.object({
  scan: z.object({
    intervalMinutes: z.number().min(1).max(1440).default(5),
    excludePatterns: z.array(z.string()).default([]),
  }),
});

export type AppSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: AppSettings = {
  scan: {
    intervalMinutes: 5,
    excludePatterns: [
      ".venv", "venv", "__pycache__", ".git", "node_modules",
      ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
      "lost+found", ".Trash", "#recycle", "@eaDir",
      "*.app", "*.pkg", "*.bundle", "*.framework",
      "*.xcodeproj", "*.xcworkspace", "*.kext",
    ],
  },
};

async function load(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export async function GET() {
  try {
    const settings = await load();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const validated = settingsSchema.parse(body);
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    // Merge user excludePatterns with defaults (extend, never replace)
    const mergedExcludes = validated.scan.excludePatterns.length > 0
      ? [...new Set([...DEFAULTS.scan.excludePatterns, ...validated.scan.excludePatterns])]
      : [...DEFAULTS.scan.excludePatterns];

    const toSave = {
      ...validated,
      scan: {
        ...validated.scan,
        excludePatterns: mergedExcludes,
      },
    };

    await fs.writeFile(SETTINGS_PATH, JSON.stringify(toSave, null, 2), "utf-8");

    // Reload scheduler with new interval
    try {
      const { setScanInterval } = await import("@/instrumentation");
      setScanInterval(validated.scan.intervalMinutes);
    } catch { /* scheduler not started yet */ }

    return NextResponse.json({ saved: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
