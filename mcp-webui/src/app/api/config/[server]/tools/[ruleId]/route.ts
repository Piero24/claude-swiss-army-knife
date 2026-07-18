/** PATCH/DELETE a specific tool rule. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const patchSchema = z.object({ access: z.enum(["none", "active"]) });

export const PATCH = apiHandler(async (request, { params }) => {
  const { server, ruleId } = await params;
  const { access } = await withValidation(patchSchema, request);

  const updatedRule = await withServerConfig(server, (config) => {
    const tools = config.permissions.tools as Array<Record<string, unknown>>;
    const idx = tools.findIndex((p) => p.id === ruleId);
    if (idx === -1) throw new Error("Rule not found");
    tools[idx].access = access;
    return tools[idx];
  });

  return NextResponse.json({ updated: true, rule: updatedRule });
});

export const DELETE = apiHandler(async (_request, { params }) => {
  const { server, ruleId } = await params;

  await withServerConfig(server, (config) => {
    const tools = config.permissions.tools as Array<Record<string, unknown>>;
    const idx = tools.findIndex((p) => p.id === ruleId);
    if (idx === -1) throw new Error("Rule not found");
    tools.splice(idx, 1);
  });

  return NextResponse.json({ deleted: true, ruleId });
});
