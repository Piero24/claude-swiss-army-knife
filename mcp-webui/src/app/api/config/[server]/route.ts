/** GET/PUT full config for a server. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { z } from "zod";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

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

function getConfigPath(server: string): string {
  // Validate server name to prevent path traversal
  const valid = ["ubuntu-server", "obsidian", "synology-nas"];
  if (!valid.includes(server)) {
    throw new Error(`Invalid server name: ${server}`);
  }
  return path.join(CONFIGS_PATH, `${server}.yaml`);
}

function ensureRuleIds(config: Record<string, unknown>): void {
  const perms = config.permissions as Record<string, unknown> | undefined;
  if (!perms) return;

  const paths = perms.paths as Array<Record<string, unknown>> | undefined;
  if (paths) {
    for (let i = 0; i < paths.length; i++) {
      if (!paths[i].id) {
        paths[i].id = `path_${i}_${Date.now().toString(36)}`;
      }
    }
  }

  const commands = perms.commands as Array<Record<string, unknown>> | undefined;
  if (commands) {
    for (let i = 0; i < commands.length; i++) {
      if (!commands[i].id) {
        commands[i].id = `cmd_${i}_${Date.now().toString(36)}`;
      }
    }
  }
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
    ensureRuleIds(config);
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
