/** GET/PUT users.yaml — agent access control config. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";
import * as yaml from "js-yaml";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";
const USERS_PATH = path.join(CONFIGS_PATH, "users.yaml");

const userSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().default(""),
  enabled: z.boolean().default(true),
  tools: z.array(z.string()).default(["*"]),
});

const usersSchema = z.object({
  mode: z.enum(["open", "allowlist", "blocklist"]).default("open"),
  users: z.array(userSchema).default([]),
});

async function load(): Promise<z.infer<typeof usersSchema>> {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const data = (yaml.load(raw) as Record<string, unknown>) || {};
    return usersSchema.parse(data);
  } catch {
    return { mode: "open", users: [] };
  }
}

export async function GET() {
  try {
    const data = await load();
    // Strip keys — never expose hashes to the frontend
    const safe = {
      mode: data.mode,
      users: data.users.map((u) => ({
        ...u,
        key: u.key ? "set" : "",
      })),
    };
    return NextResponse.json(safe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const validated = usersSchema.parse(body);
    await fs.mkdir(path.dirname(USERS_PATH), { recursive: true });
    const yamlStr = yaml.dump(validated, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(USERS_PATH, yamlStr, "utf-8");
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
