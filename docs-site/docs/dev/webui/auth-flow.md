---
sidebar_position: 5
---

# Authentication Flow

The Web UI uses API key authentication with encrypted session cookies via iron-session.

## Flow

```
1. User enters API key → POST /api/auth { apiKey }
        │
2. Server compares against WEBUI_API_KEY env var
        │
3. On match: creates iron-session cookie
   {
     authenticated: true,
     createdAt: <timestamp>
   }
        │
4. Cookie set in browser (HttpOnly, SameSite=Lax)
        │
5. Subsequent requests include cookie automatically
        │
6. Middleware checks every /api/* request:
   - Reads and decrypts session cookie
   - If missing/invalid: returns 401
   - If valid: passes through to route handler
```

## Middleware

```typescript
// src/middleware.ts
export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip auth for login endpoint
  if (request.nextUrl.pathname === "/api/auth" && request.method === "POST") {
    return NextResponse.next();
  }

  const session = await getIronSession(cookies(), sessionOptions);
  if (!session.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}
```

## iron-session Configuration

```typescript
const sessionOptions = {
  password: process.env.WEBUI_AUTH_SECRET!,  // 32+ char encryption key
  cookieName: "mcp_webui_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};
```

## API Key Validation

```typescript
// POST /api/auth
export async function POST(req: Request) {
  const { apiKey } = await req.json();
  if (apiKey !== process.env.WEBUI_API_KEY) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }
  const session = await getIronSession(cookies(), sessionOptions);
  session.authenticated = true;
  session.createdAt = Date.now();
  await session.save();
  return Response.json({ ok: true });
}
```
