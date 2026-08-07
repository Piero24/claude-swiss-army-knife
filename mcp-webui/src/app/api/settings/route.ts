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
    "ubuntu-server": {
      label: "Ubuntu Server",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" preserveAspectRatio="xMidYMid"><path d="M32 16c0 8.836-7.164 16-16 16S0 24.836 0 16 7.164 0 16 0s16 7.164 16 16z" fill="#dd4814"/><path d="M5.12 13.864c-1.18 0-2.137.956-2.137 2.137s.956 2.136 2.137 2.136S7.257 17.18 7.257 16 6.3 13.864 5.12 13.864zm15.252 9.71c-1.022.6-1.372 1.896-.782 2.917s1.895 1.372 2.917.782 1.372-1.895.782-2.917-1.896-1.37-2.917-.782zM9.76 16a6.23 6.23 0 0 1 2.653-5.105L10.852 8.28a9.3 9.3 0 0 0-3.838 5.394C7.69 14.224 8.12 15.06 8.12 16s-.432 1.776-1.106 2.326c.577 2.237 1.968 4.146 3.838 5.395l1.562-2.616A6.23 6.23 0 0 1 9.761 16zM16 9.76a6.24 6.24 0 0 1 6.215 5.687l3.044-.045a9.25 9.25 0 0 0-2.757-6.019c-.812.307-1.75.26-2.56-.208a2.99 2.99 0 0 1-1.461-2.118C17.7 6.84 16.86 6.72 16 6.72c-1.477 0-2.873.347-4.113.96l1.484 2.66c.8-.372 1.69-.58 2.628-.58zm0 12.48c-.94 0-1.83-.21-2.628-.58l-1.484 2.66c1.24.614 2.636.96 4.113.96a9.28 9.28 0 0 0 2.479-.338c.14-.858.65-1.648 1.46-2.118s1.75-.514 2.56-.207a9.25 9.25 0 0 0 2.757-6.019l-3.045-.045A6.24 6.24 0 0 1 16 22.24zm4.372-13.813c1.022.6 2.328.24 2.917-.78s.24-2.328-.78-2.918-2.328-.24-2.918.783-.24 2.327.782 2.917z" fill="#fff"/></svg>`,
    },
    "obsidian": {
      label: "Obsidian",
      icon: `<svg fill="none" height="32" width="32" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><radialGradient id="logo-bottom-left" cx="0" cy="0" gradientTransform="matrix(-59 -225 150 -39 161.4 470)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-opacity=".1"/></radialGradient><radialGradient id="logo-top-right" cx="0" cy="0" gradientTransform="matrix(50 -379 280 37 360 374.2)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></radialGradient><radialGradient id="logo-top-left" cx="0" cy="0" gradientTransform="matrix(69 -319 218 47 175.4 307)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></radialGradient><radialGradient id="logo-bottom-right" cx="0" cy="0" gradientTransform="matrix(-96 -163 187 -111 335.3 512.2)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-opacity=".3"/></radialGradient><radialGradient id="logo-top-edge" cx="0" cy="0" gradientTransform="matrix(-36 166 -112 -24 310 128.2)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></radialGradient><radialGradient id="logo-left-edge" cx="0" cy="0" gradientTransform="matrix(88 89 -190 187 111 220.2)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></radialGradient><radialGradient id="logo-bottom-edge" cx="0" cy="0" gradientTransform="matrix(9 130 -276 20 215 284)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></radialGradient><radialGradient id="logo-middle-edge" cx="0" cy="0" gradientTransform="matrix(-198 -104 327 -623 400 399.2)" gradientUnits="userSpaceOnUse" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></radialGradient><clipPath id="clip"><path d="M.2.2h512v512H.2z"/></clipPath><g clip-path="url(#clip)"><path d="M382.3 475.6c-3.1 23.4-26 41.6-48.7 35.3-32.4-8.9-69.9-22.8-103.6-25.4l-51.7-4a34 34 0 0 1-22-10.2l-89-91.7a34 34 0 0 1-6.7-37.7s55-121 57.1-127.3c2-6.3 9.6-61.2 14-90.6 1.2-7.9 5-15 11-20.3L248 8.9a34.1 34.1 0 0 1 49.6 4.3L386 125.6a37 37 0 0 1 7.6 22.4c0 21.3 1.8 65 13.6 93.2 11.5 27.3 32.5 57 43.5 71.5a17.3 17.3 0 0 1 1.3 19.2 1494 1494 0 0 1-44.8 70.6c-15 22.3-21.9 49.9-25 73.1z" fill="#6c31e3"/><path d="M165.9 478.3c41.4-84 40.2-144.2 22.6-187-16.2-39.6-46.3-64.5-70-80-.6 2.3-1.3 4.4-2.2 6.5L60.6 342a34 34 0 0 0 6.6 37.7l89.1 91.7a34 34 0 0 0 9.6 7z" fill="url(#logo-bottom-left)"/><path d="M278.4 307.8c11.2 1.2 22.2 3.6 32.8 7.6 34 12.7 65 41.2 90.5 96.3 1.8-3.1 3.6-6.2 5.6-9.2a1536 1536 0 0 0 44.8-70.6 17 17 0 0 0-1.3-19.2c-11-14.6-32-44.2-43.5-71.5-11.8-28.2-13.5-72-13.6-93.2 0-8.1-2.6-16-7.6-22.4L297.6 13.2a34 34 0 0 0-1.5-1.7 96 96 0 0 1 2 54 198.3 198.3 0 0 1-17.6 41.3l-7.2 14.2a171 171 0 0 0-19.4 71c-1.2 29.4 4.8 66.4 24.5 115.8z" fill="url(#logo-top-right)"/><path d="M278.4 307.8c-19.7-49.4-25.8-86.4-24.5-115.9a171 171 0 0 1 19.4-71c2.3-4.8 4.8-9.5 7.2-14.1 7.1-13.9 14-27 17.6-41.4a96 96 0 0 0-2-54A34.1 34.1 0 0 0 248 9l-105.4 94.8a34.1 34.1 0 0 0-10.9 20.3l-12.8 85-.5 2.3c23.8 15.5 54 40.4 70.1 80a147 147 0 0 1 7.8 24.8c28-6.8 55.7-11 82.1-8.3z" fill="url(#logo-top-left)"/><path d="M333.6 511c22.7 6.2 45.6-12 48.7-35.4a187 187 0 0 1 19.4-63.9c-25.6-55-56.5-83.6-90.4-96.3-36-13.4-75.2-9-115 .7 8.9 40.4 3.6 93.3-30.4 162.2 4 1.8 8.1 3 12.5 3.3 0 0 24.4 2 53.6 4.1 29 2 72.4 17.1 101.6 25.2z" fill="url(#logo-bottom-right)"/><g clip-rule="evenodd" fill-rule="evenodd"><path d="M254.1 190c-1.3 29.2 2.4 62.8 22.1 112.1l-6.2-.5c-17.7-51.5-21.5-78-20.2-107.6a174.7 174.7 0 0 1 20.4-72c2.4-4.9 8-14.1 10.5-18.8 7.1-13.7 11.9-21 16-33.6 5.7-17.5 4.5-25.9 3.8-34.1 4.6 29.9-12.7 56-25.7 82.4a177.1 177.1 0 0 0-20.7 72z" fill="url(#logo-top-edge)"/><path d="M194.3 293.4c2.4 5.4 4.6 9.8 6 16.5L195 311c-2.1-7.8-3.8-13.4-6.8-20-17.8-42-46.3-63.6-69.7-79.5 28.2 15.2 57.2 39 75.7 81.9z" fill="url(#logo-left-edge)"/><path d="M200.6 315.1c9.8 46-1.2 104.2-33.6 160.9 27.1-56.2 40.2-110.1 29.3-160z" fill="url(#logo-bottom-edge)"/><path d="M312.5 311c53.1 19.9 73.6 63.6 88.9 100-19-38.1-45.2-80.3-90.8-96-34.8-11.8-64.1-10.4-114.3 1l-1.1-5c53.2-12.1 81-13.5 117.3 0z" fill="url(#logo-middle-edge)"/></g></g></svg>`,
    },
    "synology-nas": {
      label: "Synology NAS",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="20.43 19.15 472.02 477.37"><path fill="#44a9fe" d="M90.98 495.78c-34.039-4.476-59.899-27.897-68.719-62.235-1.709-6.654-1.831-18.425-1.831-175.78V89.115l2.324-8.714c7.97-29.88 29.048-50.957 58.926-58.926l8.714-2.324h166.04c152.46 0 166.6.144 172.88 1.764 26.707 6.887 46.673 23.455 56.524 46.903 7.07 16.828 6.6 3.305 6.6 189.94v168.65l-2.324 8.714c-7.92 29.69-28.665 50.673-58.242 58.906l-8.354 2.325-162.9.153c-89.597.083-165.93-.246-169.63-.732zM261.8 332.9c20.825-5.275 34.521-18.343 38.017-36.274 3.666-18.801-5.585-37.395-22.503-45.232-3.446-1.596-16.369-5.578-28.717-8.847-29.901-7.918-35.478-10.9-37.16-19.865-1.677-8.94 3.792-17.332 13.113-20.125 5.279-1.582 19.883-1.708 24.917-.215 7.52 2.23 12.778 6.302 15.398 11.93 1.379 2.96 2.511 6.407 2.517 7.658.02 4.628 2.446 5.557 14.505 5.557 14.98 0 15.6-.45 13.832-10.044-4.524-24.55-26.626-40.08-57.043-40.08-24.594 0-44.122 9.999-52.343 26.802-2.462 5.032-3.01 7.66-3.334 15.978-.479 12.325 1.79 19.294 8.823 27.118 6.707 7.46 15.85 11.58 39.54 17.818 30.89 8.134 34.106 9.443 38.412 15.636 2.28 3.279 2.44 14.549.267 18.753-4.202 8.125-13.956 12.108-29.277 11.954-12.041-.121-20.127-2.596-26.357-8.066-4.188-3.677-8.6-12.217-8.615-16.677-.023-6.54-.937-6.98-14.539-6.98-15.301 0-15.351.04-13.706 10.647 4.587 29.562 31.039 47.07 67.916 44.952 4.882-.28 12.233-1.36 16.336-2.399zm-146.55-2.685c15.156-3.422 29.38-13.147 37.313-25.509 14.942-23.286 16.446-63.715 3.369-90.596-5.353-11.003-15.685-21.454-26.378-26.68-12.548-6.134-19.304-6.934-58.533-6.934-32.874 0-34.378.085-35.413 2.02-1.495 2.794-1.495 144.58 0 147.38 1.036 1.936 2.552 2.02 36.604 2.02 29.014 0 36.9-.312 43.039-1.698zm-51.484-74.01v-51.69h16.516c19.112 0 26.547 1.12 34.603 5.218 15.475 7.869 21.158 20.352 21.158 46.472 0 20.64-3.228 31.72-11.711 40.204-9.05 9.05-18.068 11.487-42.512 11.487H63.765zm283.4 74.055c.349-.908.666-25.226.705-54.04.045-34.009.42-51.656 1.065-50.3.547 1.149 9.353 25.35 19.567 53.78l18.573 51.69 11.12.295c10.598.282 11.192.184 12.642-2.088.837-1.312 9.601-24.94 19.476-52.508s18.36-50.83 18.856-51.69c.516-.896.923 21 .95 51.168.026 29.004.43 53.338.898 54.075.633.996 4.042 1.264 13.298 1.044l12.448-.296V181.02l-17.752-.259c-9.764-.142-18.375.143-19.136.633s-9.924 25.747-20.363 56.126-19.39 55.235-19.896 55.235c-.504 0-9.6-24.67-20.212-54.823s-19.782-55.421-20.377-56.152c-.817-1.005-5.565-1.26-19.469-1.044l-18.388.284-.27 74.142c-.149 40.778-.046 74.73.228 75.447.36.944 3.951 1.305 12.951 1.305 10.391 0 12.557-.273 13.086-1.651z"/></svg>`,
    },
    "github-mcp": {
      label: "GitHub",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.8" fill="#ffffff"/><path fill="#000000" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>`,
    },
    "link-manager": {
      label: "Link Manager",
      icon: `<svg fill="#ffffff" width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M30,11H25V21h2V18h3a2.0027,2.0027,0,0,0,2-2V13A2.0023,2.0023,0,0,0,30,11Zm-3,5V13h3l.001,3Z"/><polygon points="10 13 12 13 12 21 14 21 14 13 16 13 16 11 10 11 10 13"/><polygon points="23 11 17 11 17 13 19 13 19 21 21 21 21 13 23 13 23 11"/><polygon points="6 11 6 15 3 15 3 11 1 11 1 21 3 21 3 17 6 17 6 21 8 21 8 11 6 11"/></svg>`,
    },
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
    // Read existing settings to preserve server enabled/disabled states
    let existingServers: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.servers && typeof parsed.servers === "object") {
        existingServers = parsed.servers;
      }
    } catch { /* file missing */ }

    const mergedServers = { ...existingServers, ...(body.servers || validated.servers || {}) };

    const mergedExcludes = validated.scan.excludePatterns.length > 0
      ? [...new Set([...DEFAULTS.scan.excludePatterns, ...validated.scan.excludePatterns])]
      : [...DEFAULTS.scan.excludePatterns];

    const toSave = {
      ...validated,
      servers: mergedServers,
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
