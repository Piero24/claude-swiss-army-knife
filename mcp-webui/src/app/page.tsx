"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServerConfig } from "@/lib/types";
import { getConfig, updateConfig, getHealth, getServersStatus, toggleServerStatus, getAgents } from "@/lib/api";
import { logout } from "@/lib/api";
import type { HealthStatus } from "@/lib/api";
import type { ServerStatus } from "@/lib/api";
import { toast } from "sonner";
import { LogOut, Settings, Shield, AlertTriangle, User } from "lucide-react";
import Toggle from "@/components/Toggle";
import Badge from "@/components/Badge";
import StatsCards from "@/components/StatsCards";
import { ServerIcon } from "@/components/ServerIcon";
import type { ServerMeta } from "@/lib/servers";
import { getServers } from "@/lib/servers";

const HEALTH_LABELS: Record<HealthStatus["status"], string> = {
  healthy: "Connected",
  idle: "Idle",
  unconfigured: "Unconfigured",
  stopped: "Stopped",
  "not-found": "Not found",
  error: "Error",
};

export default function DashboardPage() {
  const [servers, setServers] = useState<ServerMeta[]>([]);
  const [configs, setConfigs] = useState<Record<string, ServerConfig>>({});
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [serverStatus, setServerStatus] = useState<Record<string, ServerStatus>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanServer, setScanServer] = useState("");
  const [activeScanningServers, setActiveScanningServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Array<{id: string; name: string; enabled?: boolean}>>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("selectedUser");
    loadAll(stored);
    const interval = setInterval(loadScanStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUserChange = useCallback((userId: string) => {
    setSelectedUser(userId);
    localStorage.setItem("selectedUser", userId);
    loadConfigsForUser(userId);
  }, [servers]);

  async function loadConfigsForUser(userId: string) {
    const names = servers.map((s) => s.name);
    const r: Record<string, ServerConfig> = {};
    for (const s of names) {
      try { r[s] = await getConfig(s, userId); } catch { /* */ }
    }
    setConfigs(r);
  }

  async function loadAll(initialUser?: string | null) {
    const svrs = await getServers();
    setServers(svrs);
    const names = svrs.map((s) => s.name);

    const [u, h, st] = await Promise.all([
      loadUsers(),
      loadHealth(names),
      loadServersStatus(),
    ]);

    const userList = u as Array<{ id: string; name: string }>;
    setUsers(userList);

    let effectiveUser: string | null = initialUser || null;
    if (userList.length > 0) {
      const exists = userList.some((usr) => usr.id === effectiveUser);
      if (!exists) {
        effectiveUser = userList[0].id;
      }
    }

    setSelectedUser(effectiveUser);
    if (effectiveUser) {
      localStorage.setItem("selectedUser", effectiveUser);
    }

    const c = await loadConfigs(names, effectiveUser);
    setConfigs(c);
    setHealth(h);
    setServerStatus(st);
    loadScanStatus();
    setLoading(false);
  }
  async function loadUsers() {
    try {
      const data = await getAgents();
      return (data?.users || []).map((u: { id: string; name: string; enabled?: boolean }) => ({
        id: u.id,
        name: u.name,
        enabled: u.enabled !== false,
      }));
    } catch { return []; }
  }


  async function loadConfigs(names: string[], userId?: string | null) {
    const r: Record<string, ServerConfig> = {};
    for (const s of names) { try { r[s] = await getConfig(s, userId || undefined); } catch { /* */ } }
    return r;
  }
  async function loadServersStatus() {
    try {
      const res = await getServersStatus();
      return res.servers as Record<string, ServerStatus>;
    } catch {
      return {} as Record<string, ServerStatus>;
    }
  }
  async function loadScanStatus() {
    try {
      const res = await fetch("/api/scan-status");
      const data = await res.json();
      setIsScanning(data.scanning);
      const active: string[] = data.activeServers || (data.server ? data.server.split(", ").filter(Boolean) : []);
      setActiveScanningServers(active);
      setScanServer(data.server || "");
    } catch { /* */ }
  }
  async function loadHealth(names: string[]) {
    const r: Record<string, HealthStatus> = {};
    for (const s of names) { try { r[s] = await getHealth(s); } catch { /* */ } }
    return r;
  }

  async function handleLogout() {
    try {
      await logout();
      router.push("/login");
    } catch {
      router.push("/login");
    }
  }

  async function handleToggleServer(server: string, enabled: boolean) {
    if (!effectiveUser) return;
    const prevCfg = configs[server];
    const updatedCfg = { ...(prevCfg || {}), enabled } as ServerConfig;
    setConfigs((prev) => ({ ...prev, [server]: updatedCfg }));
    try {
      await updateConfig(server, updatedCfg, effectiveUser);
    } catch {
      if (prevCfg) {
        setConfigs((prev) => ({ ...prev, [server]: prevCfg }));
      }
      toast.error("Failed to update status");
    }
  }

  function meta(name: string): ServerMeta {
    return servers.find((s) => s.name === name) || { name, label: name, icon: "🔌" };
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const hasUsers = users.length > 0;
  const effectiveUser = selectedUser && users.some((u) => u.id === selectedUser)
    ? selectedUser
    : users[0]?.id || null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* No users banner */}
      {!hasUsers && (
        <div className="mb-6 p-4 rounded-lg border border-red-800 bg-red-950/30 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">No users configured</p>
            <p className="text-xs text-red-400 mt-0.5">
              Go to <Link href="/agents" className="underline">Users & Agents</Link> to create a user.
              All MCP access is disabled until at least one user exists.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔐 MCP Permissions Manager</h1>
        <div className="flex items-center gap-4">
          {hasUsers && (
            <select
              value={effectiveUser || ""}
              onChange={(e) => handleUserChange(e.target.value)}
              className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {users.map((u: { id: string; name: string; enabled?: boolean }) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.id} {u.enabled === false ? "(Disabled)" : ""}
                </option>
              ))}
            </select>
          )}
          <Link href="/agents" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
            <Shield size={16} /> Users & Agents
          </Link>
          <Link href="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
            <Settings size={16} /> Settings
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {/* Autoscan banner under header */}
      {activeScanningServers.length > 0 && (
        <div className="mb-6 p-3 rounded-lg border border-blue-800/60 bg-blue-950/40 flex items-center justify-between">
          <span className="text-sm text-blue-400 animate-pulse font-medium flex items-center gap-2">
            🔄 Auto-discovery scanning in progress ({activeScanningServers.map((s) => meta(s).label || s).join(", ")})…
          </span>
        </div>
      )}

      {/* Stats overview */}
      <StatsCards />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {servers.map((srv) => {
          const config = configs[srv.name];
          const h = health[srv.name];
          const currentUser = users.find((u) => u.id === effectiveUser);
          const isUserAccountEnabled = !currentUser || currentUser.enabled !== false;
          const isGlobalEnabled = !serverStatus[srv.name] || serverStatus[srv.name].enabled !== false;
          const isUserEnabled = config?.enabled !== false;
          const enabled = hasUsers && isUserAccountEnabled && isGlobalEnabled && isUserEnabled;
          const cardContent = (
            <div className={`rounded-lg border p-5 transition-colors h-full flex flex-col ${enabled ? "border-gray-800 bg-gray-900 hover:border-gray-600" : "border-gray-800/50 bg-gray-900/50 opacity-50"}`}>
              <div className="flex items-start justify-between mb-2">
                <ServerIcon icon={srv.icon} className="w-8 h-8 flex items-center justify-center shrink-0 mb-1" />
                <Toggle
                  checked={hasUsers && isUserAccountEnabled && isUserEnabled && isGlobalEnabled}
                  disabled={!hasUsers || !isUserAccountEnabled || !isGlobalEnabled}
                  onChange={(checked) => handleToggleServer(srv.name, checked)}
                  label={!hasUsers ? "No users configured" : (!isUserAccountEnabled ? "User account disabled" : (!isGlobalEnabled ? "Disabled globally in Settings" : (isUserEnabled ? "Deactivate for user" : "Activate for user")))}
                />
              </div>
              <h2 className="font-semibold mb-1">{srv.label}</h2>
              <div className="text-xs text-gray-400 space-y-0.5 flex-1">
                {config ? (
                  <>
                    {Array.isArray(config.permissions?.paths) && (
                      <p>{config.permissions.paths.length} path rules</p>
                    )}
                    {Array.isArray(config.permissions?.commands) && (
                      <p>{config.permissions.commands.length} command rules</p>
                    )}
                    {Array.isArray(config.permissions?.tools) && (
                      <p>{config.permissions.tools.length} tool rules</p>
                    )}
                    {Array.isArray(config.links) && (
                      <p>{config.links.length} managed links</p>
                    )}
                    <Badge variant="status" value="loaded" label="📄 Config loaded" />
                  </>
                ) : (
                  <Badge variant="status" value="missing" label="❌ No config" />
                )}
                {enabled && h && (
                  <span className="inline-block ml-1">
                    <Badge variant="health" value={h.status} label={HEALTH_LABELS[h.status]} showIcon />
                  </span>
                )}
              </div>
            </div>
          );
          return enabled ? (
            <Link key={srv.name} href={`/${srv.name}`} className="block h-full">
              {cardContent}
            </Link>
          ) : (
            <div key={srv.name} className="h-full">{cardContent}</div>
          );
        })}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400 space-y-1">
        <p className="font-semibold text-gray-300 mb-2">Status legend</p>
        <p>🟢 <span className="text-green-400">Connected</span>: container running + recent activity</p>
        <p>🟡 <span className="text-yellow-400">Idle</span>: container running, waiting for first request</p>
        <p>🟠 <span className="text-orange-400">Unconfigured</span>: container running but credentials appear to be defaults (check .env)</p>
        <p>🔴 <span className="text-red-400">Stopped</span>: container not running</p>
        <p className="mt-2 text-gray-500">MCP servers communicate over stdio via SSH. Connect Claude Code to start using them.</p>
      </div>
    </div>
  );
}
