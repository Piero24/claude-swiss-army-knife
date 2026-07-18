/** PATCH bulk — set all path rules (or command rules) to the same access level,
 *  or apply targeted updates to specific rules via the `updates` array. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const bulkSchema = z.object({
  access: z.enum(["none", "read", "write", "active"]).optional(),
  type: z.enum(["paths", "commands"]).default("paths"),
  updates: z.array(z.object({
    id: z.string(),
    access: z.enum(["none", "read", "write", "active"]),
  })).optional(),
});

export const PATCH = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const validated = await withValidation(bulkSchema, request);
  const { access, type, updates } = validated;

  if (!access && !updates) {
    throw new Error("Provide `access` or `updates`");
  }

  let updatedCount = 0;

  await withServerConfig(server, (config) => {
    const perms = config.permissions as Record<string, unknown>;
    const rules = perms[type as string] as Array<Record<string, unknown>> | undefined;
    
    if (!rules) throw new Error(`No ${type} configured`);

    if (updates) {
      // Targeted updates
      const updateMap = new Map(updates.map((u) => [u.id, u.access]));
      for (const rule of rules) {
        const newAccess = updateMap.get(rule.id as string);
        if (newAccess !== undefined && rule.access !== newAccess) {
          rule.access = newAccess;
          updatedCount++;
        }
      }
    } else {
      // Bulk apply to all
      for (const rule of rules) {
        rule.access = access;
      }
      updatedCount = rules.length;
    }
  });

  return NextResponse.json({ updated: updatedCount, access: access ?? "mixed", type });
});
