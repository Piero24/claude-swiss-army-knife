---
sidebar_position: 6
---

# State Management

The Web UI uses React component state with optimistic updates. There is no global state library.

## Pattern: Optimistic Updates

Most mutations follow this pattern:

```typescript
async function handleTogglePath(ruleId: string, access: AccessLevel) {
  // 1. Snapshot current state
  const prev = structuredClone(config);

  // 2. Apply change immediately (optimistic)
  const newPaths = config.permissions.paths.map((p, i) =>
    i === idx ? { ...p, access } : p
  );
  setConfig({ ...config, permissions: { ...config.permissions, paths: newPaths } });

  // 3. Send API request
  try {
    await updatePathRule(server, ruleId, access);
    toast.success(`Path access set to ${access}`);
  } catch (err) {
    // 4. Revert on failure
    setConfig(prev);
    toast.error("Failed to update");
  }
}
```

This gives instant UI feedback while the API request is in flight. If the request fails, the UI reverts to the previous state.

## Pattern: Data Loading

```typescript
useEffect(() => {
  async function loadData() {
    const [cfg, audit, tree, status] = await Promise.all([
      getConfig(server),
      getAuditLog(server, auditPageSize, 0),
      getFolders(server).catch(() => ({ folders: [] })),
      getServersStatus().catch(() => ({ servers: {} })),
    ]);
    setConfig(cfg);
    setAuditLog(audit.entries);
    setFolders(tree.folders);
    setServerEnabled(status.servers[server]?.enabled !== false);
  }
  loadData();
}, [server]);
```

Multiple API calls are parallelized with `Promise.all()`. Failed calls use `.catch()` to provide fallback values instead of blocking the entire page.

## Pattern: Abort Controllers

Long-running toggle operations use abort controllers:

```typescript
const toggleAbort = useRef<AbortController | null>(null);

async function handleToggle() {
  toggleAbort.current?.abort();
  toggleAbort.current = new AbortController();
  // ... optimistic update and API call
}
```

## localStorage Usage

Scan timestamps are persisted in localStorage per server:

```typescript
localStorage.setItem(`lastScan_${server}`, label);
const lastScan = localStorage.getItem(`lastScan_${server}`);
```

## No Global Store

The app intentionally avoids Redux, Zustand, or Context for global state. Each page is self-contained:

- Dashboard loads its own server status
- Server detail page loads its own config
- Agents page loads its own user list
- Settings page loads its own settings

This keeps components decoupled and avoids stale global state after mutations.
