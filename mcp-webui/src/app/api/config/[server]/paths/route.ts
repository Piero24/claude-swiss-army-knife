/** POST — add a new path rule to a server's config. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { z } from "zod";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

const addPathRuleSchema = z.object({
  path: z.string().min(1),
  access: z.enum(["none", "read", "write"]),
  description: z.string().optional(),
});

function getConfigPath(server: string): string {
  const valid = ["ubuntu-server", "obsidian", "synology-nas"];
  if (!valid.includes(server)) throw new Error(`Invalid server: ${server}`);
  return path.join(CONFIGS_PATH, `${server}.yaml`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const body = await request.json();
    const validated = addPathRuleSchema.parse(body);
    const filePath = getConfigPath(server);

    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, any>;

    const newRule = {
      id: `path_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      path: validated.path,
      access: validated.access,
      ...(validated.description ? { description: validated.description } : {}),
    };

    config.permissions.paths.push(newRule);
    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
    await fs.writeFile(filePath, yamlStr, "utf-8");

    return NextResponse.json({ created: true, rule: newRule });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
