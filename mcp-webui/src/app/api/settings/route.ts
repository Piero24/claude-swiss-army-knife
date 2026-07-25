/** GET/PUT app settings from configs/settings.json */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";

const SETTINGS_PATH = process.env.CONFIGS_PATH
  ? path.join(process.env.CONFIGS_PATH, "settings.json")
  : "/app/configs/settings.json";

const serverEntrySchema = z.object({
  enabled: z.boolean().default(true),
});

const settingsSchema = z.object({
  scan: z.object({
    intervalMinutes: z.number().min(1).max(1440).default(60),
    excludePatterns: z.array(z.string()).default([]),
  }),
  servers: z.record(z.string(), serverEntrySchema).default({}),
  auditPageSize: z.number().refine((n) => [50, 100, 150].includes(n), { message: "Must be 50, 100, or 150" }).default(50),
});

export type AppSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: AppSettings = {
  scan: {
    intervalMinutes: 60,
    excludePatterns: [
      ".venv", "venv", "__pycache__", ".git", "node_modules",
      ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
      "lost+found", ".Trash", "#recycle", "@eaDir",
      "*.app", "*.pkg", "*.bundle", "*.framework",
      "*.xcodeproj", "*.xcworkspace", "*.kext",
    ],
  },
  servers: {
    "ubuntu-server": { enabled: true },
    "obsidian": { enabled: true },
    "synology-nas": { enabled: true },
  },
  auditPageSize: 50,
};

async function load(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

async function discoverServers(): Promise<Array<{ name: string; label: string; icon: string }>> {
  const configsDir = process.env.CONFIGS_PATH || "/app/configs";
  const { default: yaml } = await import("js-yaml");
  const map: Record<string, { label: string; icon: string }> = {
    "ubuntu-server": { label: "Ubuntu Server", icon: "🖥" },
    "obsidian": { label: "Obsidian", icon: "📝" },
    "synology-nas": { label: "Synology NAS", icon: "💾" },
    "github-mcp": { label: "GitHub", icon: "🐙" },
  };
  const servers: Array<{ name: string; label: string; icon: string }> = [];
  try {
    const files = await fs.readdir(configsDir);
    for (const file of files) {
      if (!file.endsWith(".yaml")) continue;
      if (file === "users.yaml") continue;
      try {
        const raw = await fs.readFile(path.join(configsDir, file), "utf-8");
        const config = yaml.load(raw) as Record<string, unknown> | null;
        const ui = (config?.ui || {}) as Record<string, string>;
        const name = file.replace(".yaml", "");
        const derived = map[name] || { label: name, icon: "🔌" };
        servers.push({
          name,
          label: ui.label || derived.label,
          icon: ui.icon || derived.icon,
        });
      } catch { /* skip */ }
    }
  } catch { /* dir missing */ }
  return servers;
}

export async function GET() {
  try {
    const [settings, discoveredServers] = await Promise.all([load(), discoverServers()]);
    return NextResponse.json({ ...settings, serverList: discoveredServers });
  } catch {
    return NextResponse.json({ ...DEFAULTS, serverList: [] });
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

    // Remove excluded folders from all server configs
    let cleaned = 0;
    const configsDir = process.env.CONFIGS_PATH || "/app/configs";
    const { default: yaml } = await import("js-yaml");
    // Discover servers dynamically from configs directory
    let servers: string[] = [];
    try {
      const files = await fs.readdir(configsDir);
      servers = files.filter((f) => f.endsWith(".yaml") && f !== "users.yaml").map((f) => f.replace(".yaml", ""));
    } catch { /* directory missing */ }

    for (const server of servers) {
      try {
        const configPath = path.join(configsDir, `${server}.yaml`);
        const raw = await fs.readFile(configPath, "utf-8");
        const config = yaml.load(raw) as Record<string, unknown>;
        const perms = config.permissions as Record<string, unknown>;
        const paths = (perms?.paths || []) as Array<{ path: string; description?: string }>;
        const before = paths.length;

        const filtered = paths.filter((r) => {
          const segments = r.path.replace(/\/\*\*$/, "").split("/").filter(Boolean);
          // Check every segment against exclude patterns (exact + wildcard)
          return !segments.some((seg) =>
            mergedExcludes.some((p) => {
              if (p.startsWith("*.")) return seg.endsWith(p.slice(1));
              return seg === p;
            })
          );
        });
        cleaned += before - filtered.length;

        if (filtered.length !== before) {
          (perms as Record<string, unknown>).paths = filtered;
          await fs.writeFile(configPath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");
        }
      } catch { /* skip */ }
    }

    // Reload scheduler with new interval
    try {
      const { setScanInterval } = await import("@/instrumentation");
      setScanInterval(validated.scan.intervalMinutes);
    } catch { /* scheduler not started yet */ }

    return NextResponse.json({ saved: true, cleaned });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
