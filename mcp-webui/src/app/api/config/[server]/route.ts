/** GET/PUT full config for a server. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "@/lib/config";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    if (ensureRuleIds(config)) {
      const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
      await fs.writeFile(filePath, yamlStr, "utf-8");
    }
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const body = await request.json();
    const validated = serverConfigSchema.parse(body);
    const filePath = getConfigPath(server);
    const yamlStr = yaml.dump(validated, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");
    return NextResponse.json({ saved: true, server });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
