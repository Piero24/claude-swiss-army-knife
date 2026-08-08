/** GET/PUT users.yaml — agent access control config. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";
import * as yaml from "js-yaml";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";
const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";
const USERS_PATH = path.join(CONFIGS_PATH, "users.yaml");

const userSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().default(""),
  enabled: z.boolean().default(true),
  tools: z.array(z.string()).default(["*"]),
});

const usersSchema = z.object({
  users: z.array(userSchema).default([]),
});

async function load(): Promise<z.infer<typeof usersSchema>> {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const data = (yaml.load(raw) as Record<string, unknown>) || {};
    return usersSchema.parse(data);
  } catch {
    return { users: [] };
  }
}

async function getLastSeenMap(): Promise<Record<string, string>> {
  const lastSeen: Record<string, string> = {};
  try {
    const dirs = await fs.readdir(LOGS_PATH, { withFileTypes: true });
    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;
      const logFile = path.join(LOGS_PATH, dirent.name, "audit.log");
      const raw = await fs.readFile(logFile, "utf-8").catch(() => "");
      if (!raw) continue;
      const lines = raw.split("\n").filter(Boolean);
      // Only scan the most recent ~1000 entries per server
      const recent = lines.slice(-1000);
      for (const line of recent) {
        try {
          const entry = JSON.parse(line);
          if (entry.user_id && entry.ts) {
            if (!lastSeen[entry.user_id] || entry.ts > lastSeen[entry.user_id]) {
              lastSeen[entry.user_id] = entry.ts;
            }
          }
        } catch { /* skip malformed lines */ }
      }
    }
  } catch { /* log dir may not exist yet */ }
  return lastSeen;
}

export async function GET() {
  try {
    const data = await load();
    const lastSeen = await getLastSeenMap();
    // Strip keys — never expose hashes to the frontend
    const safe = {
      users: data.users.map((u) => ({
        ...u,
        key: u.key ? "set" : "",
        lastSeen: lastSeen[u.id] || null,
      })),
    };
    return NextResponse.json(safe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const KNOWN_SERVERS = ["ubuntu-server", "obsidian", "synology-nas", "github-mcp", "link-manager"];


async function discoverServerDirs(): Promise<string[]> {
  const set = new Set<string>(KNOWN_SERVERS);
  try {
    const entries = await fs.readdir(CONFIGS_PATH, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name !== "templates") {
        set.add(e.name);
      }
    }
  } catch { /* ok */ }
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
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".yaml") && e.name !== "users.yaml") {
        set.add(e.name.replace(".yaml", ""));
      }
    }
  } catch { /* template dir missing */ }
  return Array.from(set);
}

async function generateUserConfigs(userId: string, serverName: string) {
  const serverDir = path.join(CONFIGS_PATH, serverName);
  await fs.mkdir(serverDir, { recursive: true });
  const filePath = path.join(serverDir, `${userId}.yaml`);
  try {
    await fs.access(filePath);
    return; // already exists
  } catch {
    let templateConfig: Record<string, unknown> = {};
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
      const templatePath = path.join(templateDir, `${serverName}.yaml`);
      const raw = await fs.readFile(templatePath, "utf-8");
      templateConfig = (yaml.load(raw) as Record<string, unknown>) || {};
    } catch {
      templateConfig = {
        enabled: true,
        server: { name: serverName, log_level: "INFO", audit_log: "/var/log/mcp/audit.log" },
        permissions: {
          default_access: "none",
          paths: [],
          commands: [],
          default_command_access: "none",
        },
      };
    }
    templateConfig.enabled = true;
    await fs.writeFile(filePath, yaml.dump(templateConfig, { noRefs: true, lineWidth: -1 }), "utf-8");
  }
}

async function deleteUserConfigs(userId: string) {
  const servers = await discoverServerDirs();
  for (const server of servers) {
    const filePath = path.join(CONFIGS_PATH, server, `${userId}.yaml`);
    try {
      await fs.unlink(filePath);
    } catch { /* file may not exist */ }
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const validated = usersSchema.parse(body);

    // Load old config to detect new/deleted users and preserve existing keys
    const oldUserMap: Record<string, { key: string }> = {};
    try {
      const oldRaw = await fs.readFile(USERS_PATH, "utf-8");
      const oldData = yaml.load(oldRaw) as Record<string, unknown>;
      const oldUsers = (oldData?.users as Array<{ id: string; key: string }>) || [];
      for (const u of oldUsers) {
        oldUserMap[u.id] = { key: u.key };
      }
    } catch { /* no previous users.yaml */ }
    const oldUserIds = Object.keys(oldUserMap);

    // Preserve existing keys when frontend sends the masked "set" value
    for (const user of validated.users) {
      if (user.key === "set" && oldUserMap[user.id]) {
        user.key = oldUserMap[user.id].key;
      }
    }

    await fs.mkdir(path.dirname(USERS_PATH), { recursive: true });
    const yamlStr = yaml.dump(validated, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(USERS_PATH, yamlStr, "utf-8");

    // Auto-generate configs for new users and trigger scan
    const newUsers = validated.users.filter((u) => !oldUserIds.includes(u.id));
    if (newUsers.length > 0) {
      const servers = await discoverServerDirs();
      for (const user of newUsers) {
        for (const server of servers) {
          await generateUserConfigs(user.id, server);
          fetch(`http://localhost:${process.env.PORT || 3000}/api/scan/${server}?user=${user.id}`, { method: "POST" }).catch(() => {});
        }
      }
    }

    // Purge configs for deleted users
    const deletedUserIds = Object.keys(oldUserMap).filter((id) => !validated.users.some((u) => u.id === id));
    for (const deletedId of deletedUserIds) {
      await deleteUserConfigs(deletedId);
    }

    return NextResponse.json({ saved: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
