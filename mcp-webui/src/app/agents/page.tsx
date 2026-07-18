"use client";

import { useEffect, useState } from "react";
import { getAgents, updateAgentsSettings, updateAgent } from "@/lib/api";
import type { UserConfig, UsersConfig } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Shield, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";
import DataTable from "@/components/DataTable";
import Badge from "@/components/Badge";
import type { Column } from "@/components/DataTable";

const MODES = [
  { value: "open", label: "Open", desc: "Everyone can use tools — disable specific users" },
  { value: "allowlist", label: "Allowlist", desc: "Only listed users can use tools" },
  { value: "blocklist", label: "Blocklist", desc: "Everyone except disabled users" },
] as const;

export default function AgentsPage() {
  const [data, setData] = useState<UsersConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ id: "", name: "", key: "" });

  useEffect(() => {
    getAgents()
      .then(setData)
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      await updateAgentsSettings({ mode: data.mode });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleUser(user: UserConfig) {
    if (!data) return;
    const enabled = !user.enabled;
    // Optimistic update
    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === user.id ? { ...u, enabled } : u
      ),
    });
    try {
      await updateAgent(user.id, { enabled });
    } catch {
      toast.error("Failed to update user");
      // Revert
      setData({
        ...data,
        users: data.users.map((u) =>
          u.id === user.id ? { ...u, enabled: !enabled } : u
        ),
      });
    }
  }

  async function handleToolsChange(user: UserConfig, toolsStr: string) {
    if (!data) return;
    const tools = toolsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tools.length === 0) return;

    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === user.id ? { ...u, tools } : u
      ),
    });
    try {
      await updateAgent(user.id, { tools });
      toast.success("Tools updated");
    } catch {
      toast.error("Failed to update tools");
    }
  }

  function handleAddUser() {
    if (!data || !newUser.id.trim() || !newUser.key.trim()) return;
    const keyHash = newUser.key; // will be hashed on save via API
    setData({
      ...data,
      users: [
        ...data.users,
        {
          id: newUser.id.trim(),
          key: keyHash,
          name: newUser.name.trim() || newUser.id.trim(),
          enabled: true,
          tools: ["*"],
        },
      ],
    });
    setNewUser({ id: "", name: "", key: "" });
    setShowAdd(false);
    toast.success("User added — click Save to persist");
  }

  function handleRemoveUser(userId: string) {
    if (!data) return;
    setData({
      ...data,
      users: data.users.filter((u) => u.id !== userId),
    });
    toast.success("User removed — click Save to persist");
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );

  if (!data)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-400">Failed to load</p>
      </div>
    );

  // ── Column definitions for user table ──
  const userColumns: Column<UserConfig>[] = [
    { key: "name", header: "Name", render: (u) => u.name },
    { key: "id", header: "ID", cellClassName: "font-mono text-xs text-gray-500", render: (u) => u.id },
    { key: "tools", header: "Tools", render: (u) => (
      <input
        type="text"
        defaultValue={u.tools.includes("*") ? "*" : u.tools.join(", ")}
        onBlur={(e) => handleToolsChange(u, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleToolsChange(u, e.currentTarget.value); }}
        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="*"
      />
    )},
    { key: "key", header: "Key", headerClassName: "w-[80px]", render: (u) => (
      <Badge variant="status" value={u.key ? "set" : "none"} label={u.key ? "Set" : "None"} />
    )},
    { key: "status", header: "Status", headerClassName: "w-[80px]", render: (u) => (
      <Toggle checked={u.enabled} onChange={() => handleToggleUser(u)} label={`Toggle ${u.name}`} />
    )},
    { key: "remove", header: "", headerClassName: "w-10", cellClassName: "text-center", render: (u) => (
      <button onClick={() => handleRemoveUser(u.id)} className="text-gray-600 hover:text-red-400">
        <X size={14} />
      </button>
    )},
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader
        title="Agents"
        actions={
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        }
      />

      {/* Mode selector */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Access Mode</h2>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setData({ ...data, mode: m.value })}
              className={`p-3 rounded-lg border text-left transition-colors ${
                data.mode === m.value
                  ? "border-blue-500 bg-blue-900/30 text-blue-300"
                  : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600"
              }`}
            >
              <div className="font-medium text-sm">{m.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{m.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* User table */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold">Users</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 rounded-lg border border-gray-700 bg-gray-900">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">ID</label>
                <input
                  type="text"
                  placeholder="alice"
                  value={newUser.id}
                  onChange={(e) =>
                    setNewUser({ ...newUser, id: e.target.value })
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="Alice"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Key (plaintext)</label>
                <input
                  type="text"
                  placeholder="shared-secret"
                  value={newUser.key}
                  onChange={(e) =>
                    setNewUser({ ...newUser, key: e.target.value })
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {data.users.length === 0 ? (
          <EmptyState
            icon={<Shield size={40} />}
            title="No users configured"
            description="Agents will appear here after their first MCP request, or add one manually."
            action={
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500"
              >
                Add your first user
              </button>
            }
          />
        ) : (
          <DataTable
            columns={userColumns}
            data={data.users}
            rowKey={(u) => u.id}
            emptyMessage="No users configured"
          />
        )}
      </section>
    </div>
  );
}
