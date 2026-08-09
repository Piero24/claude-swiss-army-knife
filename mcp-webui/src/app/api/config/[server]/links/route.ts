/** POST — add or update a link in a server's YAML config.
 *  Supports optional `share` to replicate the link across all user configs. */

import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const CONFIGS_PATH = process.env.CONFIGS_PATH || "/app/configs";

const addLinkSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  share: z.boolean().default(true),
});

/** Write a link to a single config file (upsert by name/url). */
async function writeLinkToFile(
  filePath: string,
  newLink: Record<string, unknown>,
): Promise<void> {
  let config: Record<string, unknown>;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    config = (yaml.load(raw) as Record<string, unknown>) || {};
  } catch {
    return; // file doesn't exist — skip
  }

  if (!Array.isArray(config.links)) config.links = [];
  const idx = (config.links as Array<Record<string, unknown>>).findIndex(
    (l: Record<string, unknown>) =>
      String(l.name).toLowerCase() ===
        String(newLink.name).toLowerCase() ||
      String(l.url) === String(newLink.url),
  );
  if (idx >= 0) {
    (config.links as Array<Record<string, unknown>>)[idx] = newLink;
  } else {
    (config.links as Array<Record<string, unknown>>).push(newLink);
  }

  const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
  await fs.writeFile(filePath, yamlStr, "utf-8");
}

/** Find all user YAML files in a server config directory. */
async function getUserConfigFiles(server: string): Promise<string[]> {
  const serverDir = path.join(CONFIGS_PATH, server);
  try {
    const files = await fs.readdir(serverDir);
    return files
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => path.join(serverDir, f));
  } catch {
    return [];
  }
}

export const POST = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const userId = new URL(request.url).searchParams.get("user") || undefined;
  const validated = await withValidation(addLinkSchema, request);

  const newLink: Record<string, unknown> = {
    name: validated.name,
    url: validated.url,
  };
  if (validated.description) newLink.description = validated.description;
  if (validated.category) newLink.category = validated.category;
  if (validated.tags && validated.tags.length > 0)
    newLink.tags = validated.tags;

  // Always write to the current user's config first
  await withServerConfig(
    server,
    (config) => {
      if (!Array.isArray(config.links)) config.links = [];
      const idx = (config.links as Array<Record<string, unknown>>).findIndex(
        (l: Record<string, unknown>) =>
          String(l.name).toLowerCase() ===
            String(newLink.name).toLowerCase() ||
          String(l.url) === String(newLink.url),
      );
      if (idx >= 0) {
        (config.links as Array<Record<string, unknown>>)[idx] = newLink;
      } else {
        (config.links as Array<Record<string, unknown>>).push(newLink);
      }
    },
    userId,
  );

  // If sharing, replicate to all other user configs
  if (validated.share && userId) {
    const allFiles = await getUserConfigFiles(server);
    let shared = 0;
    for (const filePath of allFiles) {
      // Skip the current user's file (already written above)
      const basename = path.basename(filePath, ".yaml");
      if (basename === userId) continue;
      await writeLinkToFile(filePath, newLink);
      shared++;
    }
    if (shared > 0) {
      console.info(
        `[links] Shared link "${validated.name}" to ${shared} other user(s)`,
      );
    }
  }

  return NextResponse.json({ created: true, link: newLink });
});
