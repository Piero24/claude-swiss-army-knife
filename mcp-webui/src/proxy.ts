/** Next.js proxy — auth guard for all /api/* routes except /api/auth. */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth endpoint
  if (pathname === "/api/auth") return NextResponse.next();

  // Allow health check endpoints
  if (pathname.startsWith("/api/health")) return NextResponse.next();

  // Protect all other /api/* routes
  if (pathname.startsWith("/api/")) {
    // Allow internal callers with the API key in a header (scheduler, etc.)
    const apiKey = request.headers.get("x-api-key");
    if (apiKey && apiKey === (process.env.WEBUI_API_KEY || "")) {
      return NextResponse.next();
    }

    const cookieStore = await cookies();
    const session = await getIronSession<{ authenticated?: boolean }>(cookieStore, sessionOptions);
    if (!session.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
