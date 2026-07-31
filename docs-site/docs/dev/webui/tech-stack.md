---
sidebar_position: 1
---

# Web UI Tech Stack

The Permission Manager Web UI is a Next.js 15 application with TypeScript and Tailwind CSS.

## Core Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16 |
| Language | TypeScript | 5.7 (strict mode) |
| UI Library | React | 19 |
| Styling | Tailwind CSS | 4 |
| Charts | Recharts | 3 |
| Auth | iron-session | 8 |
| Config Parsing | js-yaml | 4 |
| Validation | Zod | 4 |
| Notifications | sonner | 1 |
| Icons | lucide-react | 1 |

## Dev Tooling

| Tool | Purpose |
|---|---|
| ESLint | Linting (`eslint.config.mjs`) |
| Vitest | Unit testing |
| Testing Library | Component testing |
| TypeScript | Static type checking (`tsc --noEmit`) |
| PostCSS | CSS processing (Tailwind v4 plugin) |

## Design Decisions

### App Router (Not Pages Router)

Next.js App Router was chosen for:
- Server Components by default (reduced client JS)
- Nested layouts and loading states
- Route groups for API organization
- Middleware for auth guarding

### Client-Side Rendering

The Web UI uses `"use client"` directives extensively because:
- Session state is client-side (cookie)
- Real-time config editing needs reactive UI
- Charts (Recharts) require browser APIs
- No SSR benefit for an admin dashboard behind auth

### Dark Theme Only

The UI uses a dark color scheme exclusively (`bg-gray-900`, `text-gray-100`). There's no light mode toggle. This keeps the design simple and focused on the server management use case.

### Standalone Output

The Dockerfile uses Next.js `standalone` output mode for minimal production images:

```dockerfile
# Build stage
FROM node:22-alpine AS builder
RUN npm run build  # produces .next/standalone/

# Production stage
FROM node:22-alpine
COPY --from=builder /app/.next/standalone ./
CMD ["node", "server.js"]
```
