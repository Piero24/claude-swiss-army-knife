/** PATCH bulk — set all path rules (or command rules) to the same access level,
 *  or apply targeted updates to specific rules via the `updates` array. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "@/lib/config";

const bulkSchema = z.object({
  access: z.enum(["none", "read", "write"]).optional(),
  type: z.enum(["paths", "commands"]).default("paths"),
  updates: z.array(z.object({
    id: z.string(),
    access: z.enum(["none", "read", "write"]),
  })).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const body = await request.json();
    const { access, type, updates } = bulkSchema.parse(body);

    if (!access && !updates) {
      return NextResponse.json({ error: "Provide `access` or `updates`" }, { status: 400 });
    }

    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    const perms = config.permissions as Record<string, unknown>;

    const rules = perms[type] as Array<Record<string, unknown>> | undefined;
    if (!rules) {
      return NextResponse.json({ error: `No ${type} configured` }, { status: 400 });
    }

    let updated = 0;

    if (updates) {
      // Targeted updates: build a lookup map, apply in one pass
      const updateMap = new Map(updates.map((u) => [u.id, u.access]));
      for (const rule of rules) {
        const newAccess = updateMap.get(rule.id as string);
        if (newAccess !== undefined && rule.access !== newAccess) {
          rule.access = newAccess;
          updated++;
        }
      }
    } else {
      // Set all to one level (existing behavior)
      for (const rule of rules) {
        rule.access = access;
      }
      updated = rules.length;
    }

    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");

    return NextResponse.json({ updated, access: access ?? "mixed", type });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
