/** GET/PUT app settings from configs/settings.json */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SETTINGS_PATH = process.env.CONFIGS_PATH
  ? path.join(process.env.CONFIGS_PATH, "settings.json")
  : "/app/configs/settings.json";

const serverEntrySchema = z.object({
  enabled: z.boolean().default(true),
});

const settingsSchema = z.object({
  scan: z.object({
    intervalMinutes: z.number().min(1).max(1440).default(60),
    timeoutSeconds: z.number().default(-1),
    excludePatterns: z.array(z.string()).default([]),
  }),
  servers: z.record(z.string(), serverEntrySchema).default({}),
  auditPageSize: z.number().refine((n) => [50, 100, 150].includes(n), { message: "Must be 50, 100, or 150" }).default(50),
  synology: z.object({
    maxDownloadMb: z.number().min(1).max(10240).default(100),
    defaultSearchPath: z.string().default("/home"),
  }).optional(),
});

export type AppSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: AppSettings = {
  scan: {
    intervalMinutes: 60,
    timeoutSeconds: -1,
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
  synology: {
    maxDownloadMb: 100,
    defaultSearchPath: "/home",
  },
};

async function seedDefaultTemplates(configsDir: string): Promise<void> {
  let templateDir = "/app/templates";
  try {
    await fs.access(templateDir);
  } catch {
    try {
      templateDir = "/app/configs/templates";
      await fs.access(templateDir);
    } catch {
      templateDir = path.join(process.cwd(), "../configs/templates");
    }
  }
  try {
    await fs.mkdir(configsDir, { recursive: true });
    // Seed settings.json if missing
    const settingsFile = path.join(configsDir, "settings.json");
    try {
      await fs.access(settingsFile);
    } catch {
      const templateSettings = path.join(templateDir, "settings.json");
      try {
        await fs.copyFile(templateSettings, settingsFile);
      } catch {
        await fs.writeFile(settingsFile, JSON.stringify(DEFAULTS, null, 2), "utf-8");
      }
    }



    // Seed mcp-launcher directly into configsDir (/DATA/AppData/mcps-server/settings) (#190)
    try {
      const launcherSrc = path.join(templateDir, "mcp-launcher.sh");
      const launcherDst = path.join(configsDir, "mcp-launcher");
      try {
        await fs.access(launcherSrc);
        await fs.copyFile(launcherSrc, launcherDst);
        await fs.chmod(launcherDst, 0o755);
      } catch { /* ok */ }

    } catch {
      /* launcher creation failed */
    }
  } catch {
    /* configsDir creation failed */
  }
}

async function load(): Promise<AppSettings> {
  const configsDir = process.env.CONFIGS_PATH || "/app/configs";
  await seedDefaultTemplates(configsDir);
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

async function discoverServers(): Promise<Array<{ name: string; label: string; icon: string }>> {
  const configsDir = process.env.CONFIGS_PATH || "/app/configs";
  await seedDefaultTemplates(configsDir);
  const yaml = await import("js-yaml");
  const map: Record<string, { label: string; icon: string }> = {
    "ubuntu-server": { label: "Ubuntu Server", icon: "🖥" },
    "obsidian": { label: "Obsidian", icon: "📝" },
    "synology-nas": { label: "Synology NAS", icon: "💾" },
    "github-mcp": { label: "GitHub", icon: "🐙" },
    "link-manager": { label: "Link Manager", icon: "🔗" },
  };
  const servers: Array<{ name: string; label: string; icon: string }> = [];
  try {
    let templateDir = "/app/templates";
    try {
      await fs.access(templateDir);
    } catch {
      try {
        templateDir = "/app/configs/templates";
        await fs.access(templateDir);
      } catch {
        templateDir = path.join(process.cwd(), "../configs/templates");
      }
    }

    const entries = await fs.readdir(templateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".yaml")) continue;
      if (entry.name === "users.yaml") continue;

      const serverName = entry.name.replace(".yaml", "");
      let ui: Record<string, string> = {};
      try {
        const raw = await fs.readFile(path.join(templateDir, entry.name), "utf-8");
        const config = yaml.load(raw) as Record<string, unknown> | null;
        if (config?.ui) { ui = config.ui as Record<string, string>; }
      } catch { /* skip */ }
      
      const derived = map[serverName] || { label: serverName, icon: "🔌" };
      servers.push({
        name: serverName,
        label: ui.label || derived.label,
        icon: ui.icon || derived.icon,
      });
    }
  } catch { /* template dir missing */ }
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
    const yaml = await import("js-yaml");
    // Discover servers dynamically from configs directory
    let servers: string[] = [];
    try {
      const files = await fs.readdir(configsDir, { withFileTypes: true });
      servers = files.filter((f) => f.isDirectory() && f.name !== "templates").map((f) => f.name);
    } catch { /* directory missing */ }

    for (const server of servers) {
      try {
        const serverDir = path.join(configsDir, server);
        const userFiles = await fs.readdir(serverDir);
        for (const userFile of userFiles) {
          if (!userFile.endsWith(".yaml")) continue;
          const configPath = path.join(serverDir, userFile);
          
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
            // Snapshot non-path permission fields before replacement (#193)
            const cmds = (perms as Record<string, unknown>).commands;
            const cmdDefault = (perms as Record<string, unknown>).default_command_access;
            const tools = (perms as Record<string, unknown>).tools;
            const toolDefault = (perms as Record<string, unknown>).default_tool_access;

            (perms as Record<string, unknown>).paths = filtered;
            // Restore non-path permission fields
            if (cmds !== undefined) { (perms as Record<string, unknown>).commands = cmds; }
            if (cmdDefault !== undefined) { (perms as Record<string, unknown>).default_command_access = cmdDefault; }
            if (tools !== undefined) { (perms as Record<string, unknown>).tools = tools; }
            if (toolDefault !== undefined) { (perms as Record<string, unknown>).default_tool_access = toolDefault; }

            await fs.writeFile(configPath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");
          }
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
