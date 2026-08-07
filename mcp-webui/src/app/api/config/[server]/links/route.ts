/** POST — add or update a link in a server's YAML config. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

const addLinkSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const POST = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const userId = new URL(request.url).searchParams.get("user") || undefined;
  const validated = await withValidation(addLinkSchema, request);

  const newLink = {
    name: validated.name,
    url: validated.url,
    ...(validated.description ? { description: validated.description } : {}),
    ...(validated.category ? { category: validated.category } : {}),
    ...(validated.tags && validated.tags.length > 0 ? { tags: validated.tags } : {}),
  };

  await withServerConfig(server, (config) => {
    if (!Array.isArray(config.links)) config.links = [];
    const idx = config.links.findIndex(
      (l: Record<string, unknown>) =>
        String(l.name).toLowerCase() === newLink.name.toLowerCase() || String(l.url) === newLink.url
    );
    if (idx >= 0) {
      config.links[idx] = newLink;
    } else {
      config.links.push(newLink);
    }
  }, userId);

  return NextResponse.json({ created: true, link: newLink });
});
