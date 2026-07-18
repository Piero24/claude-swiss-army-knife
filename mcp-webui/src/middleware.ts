/** Next.js middleware — auth guard for all /api/* routes except /api/auth. */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

const sessionOptions = {
  password: process.env.WEBUI_AUTH_SECRET || "change-me-to-a-random-64-char-string",
  cookieName: "mcp-webui-session",
  cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax" as const },
};

export async function middleware(request: NextRequest) {
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
