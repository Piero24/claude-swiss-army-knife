/** GET/PUT full config for a server. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { readServerConfig, writeServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const accessLevelSchema = z.enum(["none", "read", "write"]);

const pathRuleSchema = z.object({
  id: z.string(),
  path: z.string().min(1),
  access: accessLevelSchema,
  description: z.string().optional(),
});

const commandRuleSchema = z.object({
  id: z.string(),
  pattern: z.string().min(1),
  access: accessLevelSchema,
  description: z.string().optional(),
});

const serverConfigSchema = z.object({
  server: z.object({
    name: z.string(),
    log_level: z.string(),
    audit_log: z.string(),
  }),
  permissions: z.object({
    default_access: accessLevelSchema,
    paths: z.array(pathRuleSchema),
    commands: z.array(commandRuleSchema),
    default_command_access: accessLevelSchema,
  }),
});

function ensureRuleIds(config: Record<string, unknown>): boolean {
  const perms = config.permissions as Record<string, unknown> | undefined;
  if (!perms) return false;

  let changed = false;
  const paths = perms.paths as Array<Record<string, unknown>> | undefined;
  if (paths) {
    for (let i = 0; i < paths.length; i++) {
      if (!paths[i].id) {
        paths[i].id = `path_${i}_${simpleHash(String(paths[i].path || i))}`;
        changed = true;
      }
    }
  }

  const commands = perms.commands as Array<Record<string, unknown>> | undefined;
  if (commands) {
    for (let i = 0; i < commands.length; i++) {
      if (!commands[i].id) {
        commands[i].id = `cmd_${i}_${simpleHash(String(commands[i].pattern || i))}`;
        changed = true;
      }
    }
  }

  return changed;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export const GET = apiHandler(async (_request, { params }) => {
  const { server } = await params;
  const config = await readServerConfig(server);
  if (ensureRuleIds(config)) {
    await writeServerConfig(server, config);
  }
  return NextResponse.json(config);
});

export const PUT = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const body = await request.json();
  // Validate required structure but preserve ALL fields
  serverConfigSchema.parse(body);
  await writeServerConfig(server, body);
  return NextResponse.json({ saved: true, server });
});

