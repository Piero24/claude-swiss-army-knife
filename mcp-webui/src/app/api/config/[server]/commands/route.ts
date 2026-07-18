/** POST — add a new command rule. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const addCommandSchema = z.object({
  pattern: z.string().min(1),
  access: z.enum(["none", "active"]),
  description: z.string().optional(),
});

export const POST = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const validated = await withValidation(addCommandSchema, request);

  const newRule = {
    id: `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    pattern: validated.pattern,
    access: validated.access,
    ...(validated.description ? { description: validated.description } : {}),
  };

  await withServerConfig(server, (config) => {
    if (!config.permissions.commands) config.permissions.commands = [];
    config.permissions.commands.push(newRule);
  });

  return NextResponse.json({ created: true, rule: newRule });
});
