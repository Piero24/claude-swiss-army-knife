/** POST — add a new command rule. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { getConfigPath } from "@/lib/config";

const addCommandSchema = z.object({
  pattern: z.string().min(1),
  access: z.enum(["none", "read", "write"]),
  description: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const body = await request.json();
    const validated = addCommandSchema.parse(body);
    const filePath = getConfigPath(server);

    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, any>;

    const newRule = {
      id: `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      pattern: validated.pattern,
      access: validated.access,
      ...(validated.description ? { description: validated.description } : {}),
    };

    config.permissions.commands.push(newRule);
    await fs.writeFile(filePath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");

    return NextResponse.json({ created: true, rule: newRule });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
