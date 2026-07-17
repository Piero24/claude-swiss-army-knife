/** PATCH single user — update enabled/tools fields in users.yaml. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";
import * as yaml from "js-yaml";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";
const USERS_PATH = path.join(CONFIGS_PATH, "users.yaml");

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const patch = patchSchema.parse(body);

    const raw = await fs.readFile(USERS_PATH, "utf-8");
    const data = (yaml.load(raw) as Record<string, unknown>) || {};
    const users = (data.users as Array<Record<string, unknown>>) || [];

    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (patch.enabled !== undefined) users[idx].enabled = patch.enabled;
    if (patch.tools !== undefined) users[idx].tools = patch.tools;

    const yamlStr = yaml.dump(data, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(USERS_PATH, yamlStr, "utf-8");
    return NextResponse.json({ updated: true, id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
