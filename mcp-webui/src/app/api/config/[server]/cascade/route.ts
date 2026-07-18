/** PATCH cascade — atomically update a path rule AND cascade restrictions
 *  to all child rules in a single YAML read+write cycle.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

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

export const PATCH = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const { ruleId, access } = await withValidation(cascadeSchema, request);

  const updated: Array<{ id: string; access: string }> = [
    { id: ruleId, access },
  ];

  await withServerConfig(server, (config) => {
    const rules = config.permissions?.paths as Array<Record<string, unknown>> | undefined;
    if (!rules) throw new Error("No paths configured");

    const targetIdx = rules.findIndex((r) => r.id === ruleId);
    if (targetIdx === -1) throw new Error("Rule not found");

    const targetRule = rules[targetIdx];
    const oldAccess = targetRule.access as string;
    targetRule.access = access;

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
  });

  return NextResponse.json({
    updated: updated.length,
    changes: updated,
  });
});
