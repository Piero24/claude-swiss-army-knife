---
sidebar_position: 3
---

# Component Library

Reusable React components in the Web UI.

## DataTable

A generic table component that renders data from a column definition:

```tsx
type Column<T> = {
  key: string
  header: string
  render: (item: T) => React.ReactNode
  headerClassName?: string
  cellClassName?: string
}

<DataTable
  columns={pathColumns}
  data={config.permissions.paths}
  rowKey={(r) => r.id}
  emptyMessage="No path rules configured."
/>
```

## Toggle

An on/off switch:

```tsx
<Toggle
  checked={user.enabled}
  onChange={(checked) => handleToggleUser(user)}
  label="Enable user"
/>
```

## Badge

Colored status indicators:

```tsx
<Badge variant="health" value="healthy" label="Connected" showIcon />
<Badge variant="result" value="allowed" />
<Badge variant="access" value="write" />
<Badge variant="status" value="loaded" label="Config loaded" />
```

Variants: `health`, `result`, `access`, `status`. Each maps values to predefined colors.

## AccessToggles / CommandToggles

Toggle groups for permission levels:

```tsx
<AccessToggles value="read" onChange={(level) => handleToggle(rule.id, level)} />
// Renders: [None] [Read] [Write] with current level highlighted

<CommandToggles value="active" onChange={(level) => handleToggle(rule.id, level)} />
// Renders: [None] [Active]
```

## FolderTree

Recursive folder browser with access level indicators:

```tsx
<FolderTree
  folders={visibleFolders}
  disabled={toggling}
  onToggle={(path, access) => handleCascadeToggle(path, access)}
/>
```

Each node shows the folder name and a colored access level indicator (red=none, blue=read, green=write). Clicking a node toggles its access level and cascades to children.

## PageHeader

Consistent page header:

```tsx
<PageHeader
  title="Ubuntu Server"
  backHref="/"
  actions={<button onClick={handleScan}>Scan folders</button>}
/>
```

## Modal

Dialog overlay:

```tsx
<Modal open={showDialog} onClose={() => setShowDialog(false)} title="Add Path Rule">
  <form>...</form>
</Modal>
```

## EmptyState

Placeholder for empty lists:

```tsx
<EmptyState
  icon={<Shield size={40} />}
  title="No users configured"
  description="Agents will appear after their first MCP request."
  action={<button onClick={add}>Add your first user</button>}
/>
```

## StatsCards

Recharts-based usage analytics on the dashboard. Displays request volumes over time, by server, and by user.
