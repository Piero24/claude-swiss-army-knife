/** PATCH/DELETE a specific command rule. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "@/lib/config";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ server: string; ruleId: string }> }
) {
  const { server, ruleId } = await params;
  try {
    const { access } = z.object({ access: z.enum(["none", "active"]) }).parse(await request.json());
    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, any>;
    const cmds = config.permissions.commands as Array<Record<string, unknown>>;
    const idx = cmds.findIndex((c) => c.id === ruleId);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    cmds[idx].access = access;
    await fs.writeFile(filePath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");
    return NextResponse.json({ updated: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ server: string; ruleId: string }> }
) {
  const { server, ruleId } = await params;
  try {
    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, any>;
    const cmds = config.permissions.commands as Array<Record<string, unknown>>;
    const idx = cmds.findIndex((c) => c.id === ruleId);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    cmds.splice(idx, 1);
    await fs.writeFile(filePath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
