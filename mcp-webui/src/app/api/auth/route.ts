/** Auth endpoints: GET session, POST login, DELETE logout. */

import { NextResponse } from "next/server";
import { getSession, isAuthenticated, validateApiKey } from "@/lib/auth";

export async function GET() {
  const authed = await isAuthenticated();
  return NextResponse.json({ authenticated: authed });
}

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();
    if (!apiKey || !validateApiKey(apiKey)) {
      return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 });
    }
    const session = await getSession();
    session.authenticated = true;
    session.loginTime = Date.now();
    await session.save();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ success: true });
}
