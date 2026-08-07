/** DELETE a specific link from a server's YAML config. */

import { NextResponse } from "next/server";
import { withServerConfig } from "@/lib/yaml-config";
import { apiHandler } from "@/lib/api-helpers";

export const DELETE = apiHandler(async (request, { params }) => {
  const { server, linkId } = await params;
  const userId = new URL(request.url).searchParams.get("user") || undefined;
  const targetName = decodeURIComponent(linkId);

  await withServerConfig(server, (config) => {
    if (!Array.isArray(config.links)) return;
    const links = config.links as Array<Record<string, unknown>>;
    const idx = links.findIndex(
      (l) => String(l.name).toLowerCase() === targetName.toLowerCase() || String(l.url) === targetName
    );
    if (idx !== -1) {
      links.splice(idx, 1);
    }
  }, userId);

  return NextResponse.json({ deleted: true, linkId: targetName });
});
