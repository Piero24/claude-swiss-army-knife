/** PATCH bulk — set all path rules (or command rules) to the same access level. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "@/lib/config";

const bulkSchema = z.object({
  access: z.enum(["none", "read", "write"]),
  type: z.enum(["paths", "commands"]).default("paths"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const body = await request.json();
    const { access, type } = bulkSchema.parse(body);

    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    const perms = config.permissions as Record<string, unknown>;

    const rules = perms[type] as Array<Record<string, unknown>> | undefined;
    if (!rules) {
      return NextResponse.json({ error: `No ${type} configured` }, { status: 400 });
    }

    const updated = rules.length;
    for (const rule of rules) {
      rule.access = access;
    }

    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");

    return NextResponse.json({ updated, access, type });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
