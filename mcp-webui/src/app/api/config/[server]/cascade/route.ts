/** PATCH cascade — atomically update a path rule AND cascade restrictions
 *  to all child rules in a single YAML read+write cycle.
 *
 *  This replaces the old pattern of:
 *    1. PATCH /paths/:ruleId          (read YAML, parse, modify, write)
 *    2. GET  /folders/:server         (read YAML, parse, build tree)
 *    3. PATCH /bulk (child updates)   (read YAML, parse, modify, write)
 *    4. GET  /config/:server          (read YAML, parse)
 *    5. GET  /folders/:server         (read YAML, parse, build tree)
 *
 *  With a single PATCH that does everything at once.
 */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "@/lib/config";

const cascadeSchema = z.object({
  ruleId: z.string(),
  access: z.enum(["none", "read", "write"]),
});

const LEVEL_ORDER = { none: 0, read: 1, write: 2 } as const;
type AccessLevel = keyof typeof LEVEL_ORDER;

/** Clamp a child's access so it never exceeds the parent's new level. */
function clampAccess(childAccess: string, parentAccess: AccessLevel): AccessLevel {
  const childIdx = LEVEL_ORDER[childAccess as AccessLevel] ?? 0;
  const parentIdx = LEVEL_ORDER[parentAccess];
  if (childIdx > parentIdx) {
    return parentAccess;
  }
  return childAccess as AccessLevel;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const body = await request.json();
    const { ruleId, access } = cascadeSchema.parse(body);

    const filePath = getConfigPath(server);

    // ── Single YAML read ──
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    const perms = config.permissions as Record<string, unknown>;
    const rules = perms.paths as Array<Record<string, unknown>>;

    if (!rules) {
      return NextResponse.json({ error: "No paths configured" }, { status: 400 });
    }

    // Find the target rule
    const targetIdx = rules.findIndex((r) => r.id === ruleId);
    if (targetIdx === -1) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const targetRule = rules[targetIdx];
    const oldAccess = targetRule.access as string;
    targetRule.access = access;

    // Build list of all changes (for the response)
    const updated: Array<{ id: string; access: string }> = [
      { id: ruleId, access },
    ];

    // ── Cascade to children ──
    // Only needed when making access MORE restrictive (lowering the level)
    const newLevel = LEVEL_ORDER[access];
    const oldLevel = LEVEL_ORDER[oldAccess as AccessLevel] ?? 0;

    if (newLevel < oldLevel) {
      // Normalize parent path for prefix matching
      const parentPath = (targetRule.path as string).replace(/\/\*\*$/, "");
      const prefix = parentPath + "/";

      for (const rule of rules) {
        if (rule.id === ruleId) continue;
        const childPath = (rule.path as string).replace(/\/\*\*$/, "");
        if (childPath.startsWith(prefix)) {
          const clamped = clampAccess(rule.access as string, access);
          if (rule.access !== clamped) {
            rule.access = clamped;
            updated.push({ id: rule.id as string, access: clamped });
          }
        }
      }
    }

    // ── Single YAML write ──
    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");

    return NextResponse.json({
      updated: updated.length,
      changes: updated,
    });
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
