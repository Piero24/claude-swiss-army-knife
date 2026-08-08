/** GET / PUT prompt for a server+user combination.
 *
 *  Reads/writes ONLY server.prompt — never touches the permissions section.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { readServerConfig, writeServerConfig } from "@/lib/yaml-config";
import { apiHandler, withValidation } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const promptSchema = z.object({
  prompt: z.string().max(10_000),
});

function getUserId(request: Request): string | undefined {
  const { searchParams } = new URL(request.url);
  return searchParams.get("user") || undefined;
}

export const GET = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const userId = getUserId(request);
  const config = await readServerConfig(server, userId);
  return NextResponse.json({
    prompt: (config.server as Record<string, unknown>)?.prompt ?? "",
  });
});

export const PUT = apiHandler(async (request, { params }) => {
  const { server } = await params;
  const userId = getUserId(request);
  const { prompt } = await withValidation(promptSchema, request);

  const config = await readServerConfig(server, userId);
  const srv = (config.server ??= {}) as Record<string, unknown>;
  if (prompt.trim()) {
    srv.prompt = prompt.trim();
  } else {
    delete srv.prompt;
  }
  await writeServerConfig(server, config, userId);

  return NextResponse.json({ saved: true });
});
