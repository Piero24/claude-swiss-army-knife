"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServerConfig, ServerName } from "@/lib/types";
import { SERVER_ICONS, SERVER_LABELS } from "@/lib/types";
import { getConfig, getHealth, getServersStatus, toggleServerStatus } from "@/lib/api";
import { logout } from "@/lib/api";
import type { HealthStatus } from "@/lib/api";
import type { ServerStatus } from "@/lib/api";
import { LogOut, Settings, Power } from "lucide-react";

const SERVERS: ServerName[] = ["ubuntu-server", "obsidian", "synology-nas"];

const HEALTH_BADGE: Record<HealthStatus["status"], { icon: string; color: string; label: string }> = {
  healthy: { icon: "🟢", color: "bg-green-900/50 text-green-400", label: "Connected" },
  idle: { icon: "🟡", color: "bg-yellow-900/50 text-yellow-400", label: "Idle" },
  unconfigured: { icon: "🟠", color: "bg-orange-900/50 text-orange-400", label: "Unconfigured" },
  stopped: { icon: "🔴", color: "bg-red-900/50 text-red-400", label: "Stopped" },
  "not-found": { icon: "⚪", color: "bg-gray-800 text-gray-400", label: "Not found" },
  error: { icon: "⚪", color: "bg-gray-800 text-gray-400", label: "Error" },
};

export default function DashboardPage() {
  const [configs, setConfigs] = useState<Partial<Record<ServerName, ServerConfig>>>({});
  const [health, setHealth] = useState<Partial<Record<ServerName, HealthStatus>>>({});
  const [serverStatus, setServerStatus] = useState<Record<string, ServerStatus>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanServer, setScanServer] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [c, h, st] = await Promise.all([loadConfigs(), loadHealth(), loadServersStatus()]);
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
  async function loadConfigs() {
    const r: Partial<Record<ServerName, ServerConfig>> = {};
    for (const s of SERVERS) { try { r[s] = await getConfig(s); } catch { /* */ } }
    return r;
  }
  async function loadHealth() {
    const r: Partial<Record<ServerName, HealthStatus>> = {};
    for (const s of SERVERS) { try { r[s] = await getHealth(s); } catch { /* */ } }
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

  async function handleBulkToggle(enabled: boolean) {
    // Optimistic update for all servers
    setServerStatus((prev) => {
      const next = { ...prev };
      for (const s of SERVERS) {
        next[s] = { ...(next[s] || {}), enabled };
      }
      return next;
    });
    // Fire all toggles in parallel (best-effort)
    await Promise.allSettled(SERVERS.map((s) => toggleServerStatus(s, enabled)));
    // Refresh from server to sync
    loadServersStatus().then(setServerStatus);
  }

  // Check if any server is disabled
  const hasEnabled = SERVERS.some((s) => !serverStatus[s] || serverStatus[s].enabled !== false);
  const hasDisabled = SERVERS.some((s) => serverStatus[s] && serverStatus[s].enabled === false);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {SERVERS.map((server) => {
          const config = configs[server];
          const h = health[server];
          const badge = h ? HEALTH_BADGE[h.status] : null;
          const enabled = !serverStatus[server] || serverStatus[server].enabled !== false;
          const cardContent = (
            <div className={`block rounded-lg border p-5 transition-colors ${enabled ? "border-gray-800 bg-gray-900 hover:border-gray-600" : "border-gray-800/50 bg-gray-900/50 opacity-50 cursor-not-allowed"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="text-3xl">{SERVER_ICONS[server]}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToggleServer(server, !enabled); }}
                  className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${enabled ? "bg-green-600" : "bg-gray-700"}`}
                  title={enabled ? "Deactivate" : "Activate"}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
              <h2 className="font-semibold mb-1">{SERVER_LABELS[server]}</h2>
              <div className="text-xs text-gray-400 space-y-0.5">
                {config ? (
                  <>
                    <p>{config.permissions.paths.length} path rules</p>
                    <p>{config.permissions.commands.length} command rules</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-green-900/50 text-green-400 text-xs">📄 Config loaded</span>
                  </>
                ) : (
                  <span className="inline-block px-2 py-0.5 rounded bg-red-900/50 text-red-400 text-xs">❌ No config</span>
                )}
                {badge && (
                  <span className={`inline-block ml-1 px-2 py-0.5 rounded text-xs ${badge.color}`}>{badge.icon} {badge.label}</span>
                )}
                {!enabled && (
                  <span className="inline-block ml-1 px-2 py-0.5 rounded bg-gray-800 text-gray-500 text-xs">⏸ Disabled</span>
                )}
              </div>
            </div>
          );
          return enabled ? (
            <Link key={server} href={`/${server}`}>
              {cardContent}
            </Link>
          ) : (
            <div key={server}>{cardContent}</div>
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
