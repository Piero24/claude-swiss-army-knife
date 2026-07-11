/** PATCH/DELETE a specific path rule. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "../../route"; // reuse helper

// Can't import from parent easily, redefine:
const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";
function resolvePath(server: string): string {
  const valid = ["ubuntu-server", "obsidian", "synology-nas"];
  if (!valid.includes(server)) throw new Error(`Invalid server: ${server}`);
  return require("path").join(CONFIGS_PATH, `${server}.yaml`);
}

const patchSchema = z.object({ access: z.enum(["none", "read", "write"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ server: string; ruleId: string }> }
) {
  const { server, ruleId } = await params;
  try {
    const body = await request.json();
    const { access } = patchSchema.parse(body);
    const filePath = resolvePath(server);

    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, any>;

    const paths = config.permissions.paths as Array<Record<string, unknown>>;
    const idx = paths.findIndex((p) => p.id === ruleId);
    if (idx === -1) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    paths[idx].access = access;
    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");

    return NextResponse.json({ updated: true, rule: paths[idx] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ server: string; ruleId: string }> }
) {
  const { server, ruleId } = await params;
  try {
    const filePath = resolvePath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, any>;

    const paths = config.permissions.paths as Array<Record<string, unknown>>;
    const idx = paths.findIndex((p) => p.id === ruleId);
    if (idx === -1) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    paths.splice(idx, 1);
    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");

    return NextResponse.json({ deleted: true, ruleId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
