---
sidebar_position: 2
---

# Web UI Project Structure

The Next.js App Router layout of the Permission Manager Web UI.

## Route Map

```
src/app/
├── layout.tsx                  # Root layout (dark theme, Toaster)
├── page.tsx                    # Dashboard: server cards, health, stats
├── login/page.tsx              # API key login form
├── [server]/page.tsx           # Server detail: paths, commands, tools, audit
├── agents/page.tsx             # User management: mode, add/edit/delete users
├── settings/page.tsx           # Scan interval, excludes, page size, sections
└── api/
    ├── auth/route.ts           # Login/logout/session
    ├── config/[server]/        # Server config CRUD
    │   ├── route.ts
    │   ├── paths/route.ts
    │   ├── paths/[ruleId]/route.ts
    │   ├── commands/route.ts
    │   ├── commands/[ruleId]/route.ts
    │   ├── tools/route.ts
    │   ├── tools/[ruleId]/route.ts
    │   ├── bulk/route.ts
    │   └── cascade/route.ts
    ├── agents/route.ts         # Users config CRUD
    ├── agents/[id]/route.ts    # Per-user update
    ├── audit/[server]/route.ts # Audit log queries
    ├── health/[server]/route.ts # Container health
    ├── servers/[server]/status/route.ts  # Enable/disable
    ├── scan/[server]/route.ts  # Trigger/cancel scan
    ├── scan-status/route.ts    # Scan status poll
    ├── folders/[server]/route.ts # Folder tree
    ├── settings/route.ts       # App settings
    └── stats/route.ts          # Usage statistics
```

## Component Library

```
src/components/
├── AccessToggles.tsx    # none/read/write toggle group
├── Badge.tsx            # Status, health, access, result badges
├── DataTable.tsx        # Generic column-definition-based table
├── EmptyState.tsx       # Placeholder with icon, title, action
├── FolderTree.tsx       # Recursive folder browser with access levels
├── Modal.tsx            # Dialog overlay
├── PageHeader.tsx       # Consistent header with back button, actions
├── StatsCards.tsx       # Recharts usage analytics
└── Toggle.tsx           # On/off switch
```

## Library Modules

```
src/lib/
├── api.ts               # Typed API client (all endpoints)
├── api-helpers.ts       # Server-side helper functions
├── auth.ts              # iron-session management
├── config.ts            # Config path resolution
├── types.ts             # TypeScript types mirroring Python models
├── servers.ts           # Server discovery/metadata
├── yaml-config.ts       # YAML read/write for config files
├── scheduler.ts         # Background scan scheduling
├── scan-constants.ts    # Scan defaults
├── scan-status.ts       # Scan state management
└── provider-stats/
    └── audit-stats.ts   # Audit log aggregation
```
