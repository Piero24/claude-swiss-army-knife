/** GET/PUT full config for a server. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { readServerConfig, writeServerConfig } from "@/lib/yaml-config";
import { apiHandler } from "@/lib/api-helpers";


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
  enabled: z.boolean().optional(),
  server: z.object({
    name: z.string(),
    log_level: z.string(),
    audit_log: z.string(),
  }).passthrough(),
  permissions: z.object({
    default_access: accessLevelSchema,
    paths: z.array(pathRuleSchema).optional(),
    commands: z.array(commandRuleSchema).optional(),
    default_command_access: accessLevelSchema.optional(),
  }).passthrough(),
}).passthrough();

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

function getUserId(request: Request): string | undefined {
  const { searchParams } = new URL(request.url);
  return searchParams.get("user") || undefined;
}

export const GET = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const userId = getUserId(request);
  const config = await readServerConfig(server, userId);
  if (ensureRuleIds(config)) {
    await writeServerConfig(server, config, userId);
  }
  return NextResponse.json(config);
});

export const PUT = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const userId = getUserId(request);
  const body = await request.json();
  serverConfigSchema.parse(body);
  await writeServerConfig(server, body, userId);
  return NextResponse.json({ saved: true, server });
});

