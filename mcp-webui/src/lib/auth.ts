/** Authentication helpers — API key validation and session management. */

import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  authenticated: boolean;
  loginTime: number;
}

const sessionOptions = {
  password: process.env.WEBUI_AUTH_SECRET || "change-me-to-a-random-64-char-string",
  cookieName: "mcp-webui-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 8 * 60 * 60, // 8 hours
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session.authenticated === true;
}

export function validateApiKey(key: string): boolean {
  const expected = process.env.WEBUI_API_KEY;
  if (!expected) {
    console.error("WEBUI_API_KEY not set in environment");
    return false;
  }
  return key === expected;
}
