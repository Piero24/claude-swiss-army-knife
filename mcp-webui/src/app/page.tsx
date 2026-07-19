"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServerConfig } from "@/lib/types";
import { getConfig, getHealth, getServersStatus, toggleServerStatus } from "@/lib/api";
import { logout } from "@/lib/api";
import type { HealthStatus } from "@/lib/api";
import type { ServerStatus } from "@/lib/api";
import { LogOut, Settings, Shield, Power } from "lucide-react";
import Toggle from "@/components/Toggle";
import Badge from "@/components/Badge";
import StatsCards from "@/components/StatsCards";
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
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const svrs = await getServers();
    setServers(svrs);
    const names = svrs.map((s) => s.name);
    const [c, h, st] = await Promise.all([loadConfigs(names), loadHealth(names), loadServersStatus()]);
    loadScanStatus();
    setConfigs(c); setHealth(h); setServerStatus(st); setLoading(false);
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
      setScanServer(data.server || "");
    } catch { /* */ }
  }
  async function loadConfigs(names: string[]) {
    const r: Record<string, ServerConfig> = {};
    for (const s of names) { try { r[s] = await getConfig(s); } catch { /* */ } }
    return r;
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
    // Optimistic update
    setServerStatus((prev) => ({
      ...prev,
      [server]: { ...(prev[server] || {}), enabled },
    }));
    try {
      await toggleServerStatus(server, enabled);
    } catch {
      // Revert
      setServerStatus((prev) => ({
        ...prev,
        [server]: { ...(prev[server] || {}), enabled: !enabled },
      }));
    }
  }

  function meta(name: string): ServerMeta {
    return servers.find((s) => s.name === name) || { name, label: name, icon: "🔌" };
  }

  async function handleBulkToggle(enabled: boolean) {
    const names = servers.map((s) => s.name);
    setServerStatus((prev) => {
      const next = { ...prev };
      for (const s of names) {
        next[s] = { ...(next[s] || {}), enabled };
      }
      return next;
    });
    await Promise.allSettled(names.map((s) => toggleServerStatus(s, enabled)));
    loadServersStatus().then(setServerStatus);
  }

  const names = servers.map((s) => s.name);
  const hasEnabled = names.some((s) => !serverStatus[s] || serverStatus[s].enabled !== false);
  const hasDisabled = names.some((s) => serverStatus[s] && serverStatus[s].enabled === false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">🔐 MCP Permissions Manager</h1>
        {isScanning && <span className="text-xs text-blue-400 animate-pulse">🔄 Scanning{scanServer ? ` ${scanServer}` : ""}…</span>}
        <Link href="/agents" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <Shield size={16} /> Agents
        </Link>
        <Link href="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <Settings size={16} /> Settings
        </Link>
        <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <LogOut size={16} /> Logout
        </button>
      </div>

      {/* Bulk toggle buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => handleBulkToggle(true)}
          disabled={!hasDisabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded border border-green-700 text-green-400 hover:bg-green-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Power size={12} /> Activate all
        </button>
        <button
          onClick={() => handleBulkToggle(false)}
          disabled={!hasEnabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded border border-red-700 text-red-400 hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Power size={12} /> Deactivate all
        </button>
      </div>

      {/* Stats overview */}
      <StatsCards />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {servers.map((srv) => {
          const config = configs[srv.name];
          const h = health[srv.name];
          const enabled = !serverStatus[srv.name] || serverStatus[srv.name].enabled !== false;
          const cardContent = (
            <div className={`rounded-lg border p-5 transition-colors h-full flex flex-col ${enabled ? "border-gray-800 bg-gray-900 hover:border-gray-600" : "border-gray-800/50 bg-gray-900/50 opacity-50"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="text-3xl">{srv.icon}</div>
                <Toggle
                  checked={enabled}
                  onChange={(checked) => handleToggleServer(srv.name, checked)}
                  label={enabled ? "Deactivate" : "Activate"}
                />
              </div>
              <h2 className="font-semibold mb-1">{srv.label}</h2>
              <div className="text-xs text-gray-400 space-y-0.5 flex-1">
                {config ? (
                  <>
                    <p>{config.permissions.paths.length} path rules</p>
                    <p>{config.permissions.commands.length} command rules</p>
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
        <p>🟢 <span className="text-green-400">Connected</span> — container running + recent activity</p>
        <p>🟡 <span className="text-yellow-400">Idle</span> — container running, waiting for first request</p>
        <p>🟠 <span className="text-orange-400">Unconfigured</span> — container running but credentials appear to be defaults (check .env)</p>
        <p>🔴 <span className="text-red-400">Stopped</span> — container not running</p>
        <p className="mt-2 text-gray-500">MCP servers communicate over stdio via SSH. Connect Claude Code to start using them.</p>
      </div>
    </div>
  );
}
