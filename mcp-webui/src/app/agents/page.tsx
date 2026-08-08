"use client";

import { useEffect, useState } from "react";
import { getAgents, updateAgentsSettings, updateAgent, scanServer } from "@/lib/api";
import type { UserConfig, UsersConfig } from "@/lib/types";
import { getServers } from "@/lib/servers";
import { toast } from "sonner";
import { Plus, Shield, X, Code, Copy, Check } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";



function relativeTime(ts: string | null | undefined): string {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return "Just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function AgentsPage() {
  const [data, setData] = useState<UsersConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [userSecrets, setUserSecrets] = useState<Record<string, string>>({});
  const [jsonModalUser, setJsonModalUser] = useState<{ id: string; name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getAgents()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      await updateAgentsSettings({
        mode: data.mode,
        users: data.users,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleUser(user: UserConfig) {
    if (!data) return;
    const updated = !user.enabled;
    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === user.id ? { ...u, enabled: updated } : u
      ),
    });
    try {
      await updateAgent(user.id, { enabled: updated });
      toast.success(`User ${user.name} ${updated ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update user status");
    }
  }

  async function handleAddUser() {
    if (!data || !newUserName.trim()) return;
    const name = newUserName.trim();
    // Pure 10-digit numeric ID
    const id = String(Math.floor(1000000000 + Math.random() * 9000000000));

    // Generate 32-character secret
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    let secret = "";
    for (let i = 0; i < 32; i++) {
      secret += chars[array[i] % chars.length];
    }

    // Generate 16-byte salt & sha256 hash
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    let hex: string;
    if (crypto.subtle) {
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + secret));
      hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } else {
      const { sha256hex } = await import("@/lib/sha256-fallback");
      hex = sha256hex(salt + secret);
    }
    const keyHash = `sha256$${salt}$${hex}`;

    const newUserObj: UserConfig = {
      id,
      name,
      key: keyHash,
      enabled: true,
      tools: ["*"],
    };

    setData({
      ...data,
      users: [...data.users, newUserObj],
    });

    setUserSecrets((prev) => ({ ...prev, [id]: secret }));
    setNewUserName("");
    setShowAdd(false);
    toast.success("User added: click Save to persist");

    // Automatically trigger auto-discovery scan for all servers for the new user
    getServers().then((svrs) => {
      for (const s of svrs) {
        scanServer(s.name, id).catch(() => {});
      }
    });

    // Auto open MCP JSON template modal
    setJsonModalUser({ id, name, secret });
  }

  function handleRemoveUser(userId: string) {
    if (!data) return;
    setData({
      ...data,
      users: data.users.filter((u) => u.id !== userId),
    });
    toast.success("User removed: click Save to persist");
  }

  function getMcpJsonSnippet(userId: string, secretKey: string) {
    const keyVal = secretKey || "<YOUR_MCP_USER_KEY>";
    const serversList = ["ubuntu-server", "obsidian", "synology-nas", "github", "link-manager"];
    const mcpServersObj: Record<string, unknown> = {};

    for (const srv of serversList) {
      mcpServersObj[srv] = {
        command: "ssh",
        args: [
          "-p",
          "2222",
          "mcpuser@<YOUR_SERVER_IP>",
          `MCP_USER_ID=${userId}`,
          `MCP_USER_KEY=${keyVal}`,
          "mcp-launcher",
          srv,
        ],
      };
    }

    return JSON.stringify({ mcpServers: mcpServersObj }, null, 2);
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
    {
      key: "name",
      header: "Name",
      headerClassName: "w-1/4",
      render: (u) => <span className="font-medium text-gray-200">{u.name}</span>,
    },
    {
      key: "id",
      header: "User ID",
      headerClassName: "w-1/5",
      cellClassName: "font-mono text-xs text-blue-400",
      render: (u) => u.id,
    },
    {
      key: "lastSeen",
      header: "Last seen",
      headerClassName: "w-36",
      render: (u) => (
        <span className="text-xs text-gray-400">{relativeTime(u.lastSeen)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      headerClassName: "w-28 text-center",
      cellClassName: "text-center",
      render: (u) => (
        <div className="flex justify-center">
          <Toggle checked={u.enabled} onChange={() => handleToggleUser(u)} label={`Toggle ${u.name}`} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "Config",
      headerClassName: "w-40 text-center",
      cellClassName: "text-center",
      render: (u) => (
        <button
          onClick={() => setJsonModalUser({ id: u.id, name: u.name, secret: userSecrets[u.id] || "" })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-800/60 transition-colors"
        >
          <Code size={13} /> Generate JSON
        </button>
      ),
    },
    {
      key: "remove",
      header: "",
      headerClassName: "w-12 text-right pr-4",
      cellClassName: "text-right pr-4",
      render: (u) => (
        <button onClick={() => handleRemoveUser(u.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1">
          <X size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader
        title="Users & Agents"
        actions={
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        }
      />

      {/* User table */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold">Users</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 font-medium text-white transition-colors"
          >
            <Plus size={14} /> Add User
          </button>
        </div>

        {/* Simplified Add User Form */}
        {showAdd && (
          <div className="mb-4 p-4 rounded-lg border border-gray-700 bg-gray-900">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Create New User</h3>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Name (mandatory)</label>
              <input
                type="text"
                placeholder="e.g. Claude Code / Piero Work Laptop"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddUser(); }}
                className="w-full max-w-md rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-[10px] text-gray-500 mt-1">
                The User ID and secret key will be generated automatically upon creation.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddUser}
                disabled={!newUserName.trim()}
                className="px-4 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium"
              >
                Create User
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewUserName(""); }}
                className="px-3 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {data.users.length === 0 ? (
          <EmptyState
            icon={<Shield size={40} />}
            title="No users configured"
            description="Add your first user to enable MCP server permissions."
            action={
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 font-medium"
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

      {/* Modal for MCP JSON Template */}
      {jsonModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                  <Code className="text-blue-400" size={20} /> MCP JSON Configuration Template
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  User: <span className="text-white font-medium">{jsonModalUser.name}</span> (ID: <code className="text-blue-400 font-mono">{jsonModalUser.id}</code>)
                </p>
              </div>
              <button
                onClick={() => { setJsonModalUser(null); setCopied(false); }}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-gray-300 mb-3">
              Copy this JSON template into your CLI IDE setup (e.g. <code className="text-yellow-400">.claude.json</code> or MCP extension config):
            </p>

            <div className="relative mb-4">
              <pre className="p-4 rounded border border-gray-800 bg-black/80 text-xs text-green-400 font-mono overflow-x-auto max-h-80 select-all">
                {getMcpJsonSnippet(jsonModalUser.id, jsonModalUser.secret)}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getMcpJsonSnippet(jsonModalUser.id, jsonModalUser.secret));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                  toast.success("MCP JSON copied to clipboard");
                }}
                className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            </div>

            {!jsonModalUser.secret && (
              <p className="text-xs text-yellow-400 bg-yellow-950/40 p-2.5 rounded border border-yellow-800/60 mb-4">
                Note: Replace <code className="text-white font-mono">&lt;YOUR_MCP_USER_KEY&gt;</code> with the plaintext secret key generated when this user was created.
              </p>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => { setJsonModalUser(null); setCopied(false); }}
                className="px-4 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
