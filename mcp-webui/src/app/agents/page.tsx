"use client";

import { useEffect, useState } from "react";
import { getAgents, updateAgentsSettings, updateAgent } from "@/lib/api";
import type { UserConfig, UsersConfig } from "@/lib/types";
import { toast } from "sonner";
import { Copy, Key, Plus, Shield, X } from "lucide-react";
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

/** Generate a random 32-character hex secret. */
function generateSecret(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 32; i++) {
    result += chars[buf[i] % chars.length];
  }
  return result;
}

/** Hash a secret with salt to produce sha256$<salt>$<hash> format. */
async function hashSecret(secret: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256$${salt}$${hash}`;
}

/** Format a relative time string ("3m ago", "2h ago", "never"). */
function relativeTime(ts: string | null | undefined): string {
  if (!ts) return "never";
  const now = Date.now();
  const then = new Date(ts).getTime();
  if (isNaN(then)) return "never";
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AgentsPage() {
  const [data, setData] = useState<UsersConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ id: "", name: "", key: "" });
  const [generatedSecret, setGeneratedSecret] = useState("");
  const [generating, setGenerating] = useState(false);

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

  async function handleGenerateKey() {
    setGenerating(true);
    try {
      const secret = generateSecret();
      const hashed = await hashSecret(secret);
      setGeneratedSecret(secret);
      setNewUser({ ...newUser, key: hashed });
    } catch {
      toast.error("Failed to generate key");
    } finally {
      setGenerating(false);
    }
  }

  function handleAddUser() {
    if (!data || !newUser.id.trim() || !newUser.key.trim()) return;
    setData({
      ...data,
      users: [
        ...data.users,
        {
          id: newUser.id.trim(),
          key: newUser.key,
          name: newUser.name.trim() || newUser.id.trim(),
          enabled: true,
          tools: ["*"],
          lastSeen: null,
        },
      ],
    });
    setNewUser({ id: "", name: "", key: "" });
    setGeneratedSecret("");
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
    { key: "lastSeen", header: "Last seen", headerClassName: "w-[100px]", cellClassName: "text-xs text-gray-400", render: (u) => (
      relativeTime((u as Record<string, unknown>).lastSeen as string | null)
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
                <label className="block text-xs text-gray-400 mb-1">
                  {generatedSecret ? "Hashed key" : "Key"}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder={generatedSecret ? "sha256$..." : "plaintext or hashed key"}
                    value={newUser.key}
                    onChange={(e) =>
                      setNewUser({ ...newUser, key: e.target.value })
                    }
                    readOnly={!!generatedSecret}
                    className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:text-gray-500"
                  />
                  <button
                    onClick={handleGenerateKey}
                    disabled={generating}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                    title="Generate a random key"
                  >
                    <Key size={14} />
                    {generating ? "…" : "Generate"}
                  </button>
                </div>
              </div>
            </div>

            {generatedSecret && (
              <div className="mb-3 p-3 rounded border border-yellow-700 bg-yellow-900/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-yellow-400">
                    Copy this key now — it cannot be shown again
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm text-yellow-300 font-mono break-all">
                    {generatedSecret}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedSecret);
                      toast.success("Key copied to clipboard");
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-yellow-800 hover:bg-yellow-700"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setGeneratedSecret("");
                }}
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
