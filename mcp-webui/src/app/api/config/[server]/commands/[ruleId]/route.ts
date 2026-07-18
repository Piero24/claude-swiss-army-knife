/** PATCH/DELETE a specific command rule. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const patchSchema = z.object({ access: z.enum(["none", "active"]) });

export const PATCH = apiHandler(async (request, { params }) => {
  const { server, ruleId } = await params;
  const { access } = await withValidation(patchSchema, request);

  await withServerConfig(server, (config) => {
    const cmds = config.permissions.commands as Array<Record<string, unknown>>;
    const idx = cmds.findIndex((c) => c.id === ruleId);
    if (idx === -1) throw new Error("Not found");
    cmds[idx].access = access;
  });

  return NextResponse.json({ updated: true });
});

export const DELETE = apiHandler(async (_request, { params }) => {
  const { server, ruleId } = await params;

  await withServerConfig(server, (config) => {
    const cmds = config.permissions.commands as Array<Record<string, unknown>>;
    const idx = cmds.findIndex((c) => c.id === ruleId);
    if (idx === -1) throw new Error("Not found");
    cmds.splice(idx, 1);
  });

  return NextResponse.json({ deleted: true });
});
