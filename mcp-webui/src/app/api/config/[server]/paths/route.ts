/** POST — add a new path rule to a server's config. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const addPathRuleSchema = z.object({
  path: z.string().min(1),
  access: z.enum(["none", "read", "write"]),
  description: z.string().optional(),
});

export const POST = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const validated = await withValidation(addPathRuleSchema, request);

  const newRule = {
    id: `path_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    path: validated.path,
    access: validated.access,
    ...(validated.description ? { description: validated.description } : {}),
  };

  await withServerConfig(server, (config) => {
    if (!config.permissions.paths) config.permissions.paths = [];
    config.permissions.paths.push(newRule);
  });

  return NextResponse.json({ created: true, rule: newRule });
});
