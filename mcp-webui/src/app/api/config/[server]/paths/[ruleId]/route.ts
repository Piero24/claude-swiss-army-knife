/** PATCH/DELETE a specific path rule. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const patchSchema = z.object({ access: z.enum(["none", "read", "write"]) });

export const PATCH = apiHandler(async (request, { params }) => {
  const { server, ruleId } = await params;
  const { access } = await withValidation(patchSchema, request);

  const updatedRule = await withServerConfig(server, (config) => {
    const paths = config.permissions.paths as Array<Record<string, unknown>>;
    const idx = paths.findIndex((p) => p.id === ruleId);
    if (idx === -1) {
      throw new Error("Rule not found");
    }
    paths[idx].access = access;
    return paths[idx];
  });

  return NextResponse.json({ updated: true, rule: updatedRule });
});

export const DELETE = apiHandler(async (_request, { params }) => {
  const { server, ruleId } = await params;

  await withServerConfig(server, (config) => {
    const paths = config.permissions.paths as Array<Record<string, unknown>>;
    const idx = paths.findIndex((p) => p.id === ruleId);
    if (idx === -1) {
      throw new Error("Rule not found");
    }
    paths.splice(idx, 1);
  });

  return NextResponse.json({ deleted: true, ruleId });
});
