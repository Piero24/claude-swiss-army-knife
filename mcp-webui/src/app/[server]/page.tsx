"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { AccessLevel, AuditEntry, CommandRule, PathRule, ServerConfig, ServerName } from "@/lib/types";
import { SERVER_LABELS } from "@/lib/types";
import { getConfig, getFolders, getServersStatus, updatePathRule, updateCommandRule, deletePathRule, deleteCommandRule, addPathRule, addCommandRule, getAuditLog, bulkSetAccess, bulkUpdatePathRules, cascadePathAccess, scanServer } from "@/lib/api";
import type { FolderNode } from "@/lib/api";
import FolderTree from "@/components/FolderTree";
import { toast } from "sonner";
import { ArrowLeft, Folders, Plus, RefreshCw, Trash2 } from "lucide-react";

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const server = params.server as ServerName;

  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPath, setShowAddPath] = useState(false);
  const [showAddCmd, setShowAddCmd] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{ access: AccessLevel; type: "paths" | "commands" } | null>(null);
  const [pathSearch, setPathSearch] = useState("");
  const [pathAccessFilter, setPathAccessFilter] = useState<AccessLevel | "all">("all");
  const [logSearch, setLogSearch] = useState("");
  const [logAccessFilter, setLogAccessFilter] = useState<AccessLevel | "all">("all");
  const [logResultFilter, setLogResultFilter] = useState<"all" | "allowed" | "denied">("all");
  const [logDateFilter, setLogDateFilter] = useState<"all" | "hour" | "today" | "week">("all");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem(`lastScan_${server}`) || null;
    return null;
  });
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [collapseKey, setCollapseKey] = useState(0);
  const [serverEnabled, setServerEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const toggleAbort = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cfg, audit, tree, st] = await Promise.all([
        getConfig(server),
        getAuditLog(server, 50),
        getFolders(server).catch(() => ({ folders: [], server: "", count: 0 })),
        getServersStatus().catch(() => ({ servers: {} as Record<string, { enabled: boolean }> })),
      ]);
      setConfig(cfg);
      setFolders(tree.folders || []);
      setAuditLog(audit);
      const srv = st.servers[server];
      setServerEnabled(!srv || srv.enabled !== false);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [server]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleTogglePath(ruleId: string, access: AccessLevel) {
    if (!config) return;
    // Optimistic update — immutable to ensure React detects the change
    const prev = structuredClone(config);
    const idx = config.permissions.paths.findIndex((p) => p.id === ruleId);
    if (idx < 0) return;
    const newPaths = config.permissions.paths.map((p, i) =>
      i === idx ? { ...p, access } : p
    );
    setConfig({ ...config, permissions: { ...config.permissions, paths: newPaths } });
    try {
      await updatePathRule(server, ruleId, access);
      toast.success(`Path access set to ${access}`);
    } catch (err) {
      setConfig(prev);
      toast.error("Failed to update");
    }
  }

  async function handleDeletePath(ruleId: string) {
    if (!config) return;
    const prev = structuredClone(config);
    const newPaths = config.permissions.paths.filter((p) => p.id !== ruleId);
    setConfig({ ...config, permissions: { ...config.permissions, paths: newPaths } });
    try {
      await deletePathRule(server, ruleId);
      toast.success("Path rule removed");
    } catch (err) {
      setConfig(prev);
      toast.error("Failed to delete");
    }
  }

  async function handleAddPath(data: { path: string; access: AccessLevel; description?: string }) {
    try {
      const res = await addPathRule(server, data);
      toast.success("Path rule added");
      setShowAddPath(false);
      loadData();
    } catch (err) {
      toast.error("Failed to add rule");
    }
  }

  async function handleToggleCommand(ruleId: string, access: AccessLevel) {
    if (!config) return;
    const prev = structuredClone(config);
    const idx = config.permissions.commands.findIndex((c) => c.id === ruleId);
    if (idx < 0) return;
    const newCommands = config.permissions.commands.map((c, i) =>
      i === idx ? { ...c, access } : c
    );
    setConfig({ ...config, permissions: { ...config.permissions, commands: newCommands } });
    try {
      await updateCommandRule(server, ruleId, access);
      toast.success(`Command access set to ${access}`);
    } catch (err) {
      setConfig(prev);
      toast.error("Failed to update");
    }
  }

  async function handleDeleteCommand(ruleId: string) {
    if (!config) return;
    const prev = structuredClone(config);
    const newCommands = config.permissions.commands.filter((c) => c.id !== ruleId);
    setConfig({ ...config, permissions: { ...config.permissions, commands: newCommands } });
    try {
      await deleteCommandRule(server, ruleId);
      toast.success("Command rule removed");
    } catch (err) {
      setConfig(prev);
      toast.error("Failed to delete");
    }
  }

  async function handleBulkSet(access: AccessLevel, type: "paths" | "commands") {
    if (!config) return;
    try {
      await bulkSetAccess(server, access, type);
      toast.success(`All ${type} set to ${access}`);
      setBulkConfirm(null);
      loadData();
      getFolders(server).then((t) => setFolders(t.folders || [])).catch(() => {});
    } catch (err) {
      toast.error("Failed to update");
    }
  }

  async function handleScan() {
    setScanning(true);
    const started = Date.now();
    try {
      const res = await scanServer(server);
      const elapsed = Date.now() - started;
      const dur = elapsed < 60000
        ? `${(elapsed / 1000).toFixed(0)}s`
        : `${Math.floor(elapsed / 60000)}m ${Math.round((elapsed % 60000) / 1000)}s`;
      if (res.added > 0) {
        toast.success(`Found ${res.added} folder${res.added > 1 ? "s" : ""} in ${dur}`);
        loadData();
      } else {
        toast.success(`Scan complete — ${res.total} folders, no new ones (${dur})`);
      }
      const label = `${new Date().toLocaleTimeString()} (${dur})`;
      setLastScan(label);
      if (typeof window !== "undefined") localStorage.setItem(`lastScan_${server}`, label);
    } catch (err) {
      if (err instanceof Error && err.message !== "Unauthorized") toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleCancelScan() {
    try {
      await fetch(`/api/scan/${server}/cancel`, { method: "POST" });
      toast.success("Scan cancelled");
    } catch (err) {
      // ignore
    }
  }

  async function handleAddCommand(data: { pattern: string; access: AccessLevel; description?: string }) {
    try {
      await addCommandRule(server, data);
      toast.success("Command rule added");
      setShowAddCmd(false);
      loadData();
    } catch (err) {
      toast.error("Failed to add rule");
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-400">Loading...</p></div>;
  if (!config) return <div className="flex min-h-screen items-center justify-center"><p className="text-red-400">Failed to load config</p></div>;

  // Recursively filter tree by access level, preserving parent chains of matches
  function filterTreeByAccess(nodes: FolderNode[], access: string): FolderNode[] {
    return nodes.reduce((acc, node) => {
      const filteredChildren = filterTreeByAccess(node.children, access);
      if (node.access === access || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, [] as FolderNode[]);
  }

  // Combine text search + access filter
  let visibleFolders = folders;
  if (pathAccessFilter !== "all") {
    visibleFolders = filterTreeByAccess(visibleFolders, pathAccessFilter);
  }
  if (pathSearch) {
    const q = pathSearch.toLowerCase();
    visibleFolders = visibleFolders.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
  }

  // Combine audit log filters: text search + access + result + date range
  const now = Date.now();
  const dateThresholds: Record<string, number> = {
    hour: now - 60 * 60 * 1000,
    today: new Date(new Date().toDateString()).getTime(),
    week: now - 7 * 24 * 60 * 60 * 1000,
  };
  const visibleAuditLog = auditLog.filter((e) => {
    if (logAccessFilter !== "all" && e.access !== logAccessFilter) return false;
    if (logResultFilter !== "all" && e.result !== logResultFilter) return false;
    if (logDateFilter !== "all") {
      if (!e.ts) return false;
      const ts = new Date(e.ts).getTime();
      if (isNaN(ts) || ts < dateThresholds[logDateFilter]) return false;
    }
    if (logSearch) {
      const q = logSearch.toLowerCase();
      return (e.target || "").toLowerCase().includes(q)
        || (e.command || "").toLowerCase().includes(q)
        || (e.result || "").toLowerCase().includes(q)
        || (e.reason || "").toLowerCase().includes(q);
    }
    return true;
  });

  const logFiltersActive = logAccessFilter !== "all" || logResultFilter !== "all" || logDateFilter !== "all";
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold">{SERVER_LABELS[server]}</h1>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1 ml-auto text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning…" : "Scan folders"}
        </button>
        {scanning && (
          <button onClick={handleCancelScan} className="text-sm text-red-400 hover:text-red-300">
            Cancel
          </button>
        )}
        {lastScan && <span className="text-xs text-gray-500">{lastScan}</span>}
      </div>

      {!serverEnabled && (
        <div className="mb-6 rounded-lg border border-yellow-800 bg-yellow-900/30 p-4 flex items-center gap-3">
          <span className="text-yellow-400 text-lg">⏸</span>
          <div>
            <p className="text-yellow-300 font-semibold text-sm">Server Deactivated</p>
            <p className="text-yellow-500 text-xs">This server is currently disabled. Tools are unavailable until reactivated from the dashboard.</p>
          </div>
        </div>
      )}

      {/* Path Permissions — Tree View */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Path Permissions</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">Set all:</span>
            {(["none", "read", "write"] as AccessLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setBulkConfirm({ access: level, type: "paths" })}
                className="px-2 py-0.5 text-xs rounded border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
              >
                {level}
              </button>
            ))}
            <button onClick={() => setShowAddPath(true)} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 ml-3">
              <Plus size={16} /> Add
            </button>
            <button onClick={() => setCollapseKey((k) => k + 1)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white ml-2" title="Collapse all folders">
              <Folders size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="Filter folders…"
            value={pathSearch}
            onChange={(e) => setPathSearch(e.target.value)}
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
            {(["all", "none", "read", "write"] as const).map((level) => {
              const active = pathAccessFilter === level;
              const colors: Record<string, string> = {
                all: "bg-gray-700 text-gray-300",
                none: "bg-gray-600 text-gray-300",
                read: "bg-blue-600 text-white",
                write: "bg-green-600 text-white",
              };
              return (
                <button
                  key={level}
                  onClick={() => setPathAccessFilter(level)}
                  className={`px-2 py-1 text-xs font-medium transition-colors
                    ${active ? colors[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              );
            })}
          </div>
        </div>
        {folders.length > 0 ? (
          <FolderTree
            key={collapseKey}
            folders={visibleFolders}
            disabled={toggling}
            onToggle={async (folderPath, access) => {
              if (toggling) return;
              // Find matching rule
              const cleanPath = folderPath.replace(/\/\*\*$/, "");
              const rule = config?.permissions.paths.find(
                (r) => r.path.replace(/\/\*\*$/, "") === cleanPath
              );
              if (!rule) return;

              // ── Optimistic UI: apply parent + cascade immediately ──
              const LEVEL_ORDER: Record<string, number> = { none: 0, read: 1, write: 2 };
              const accessIdx = LEVEL_ORDER[access] ?? 0;
              const prevConfig = structuredClone(config!);
              const prefix = cleanPath + "/";

              const newPaths = config!.permissions.paths.map((p) => {
                if (p.id === rule.id) return { ...p, access };
                const childPath = p.path.replace(/\/\*\*$/, "");
                if (childPath.startsWith(prefix)) {
                  const childIdx = LEVEL_ORDER[p.access] ?? 0;
                  if (childIdx > accessIdx) return { ...p, access };
                }
                return p;
              });
              setConfig({ ...config!, permissions: { ...config!.permissions, paths: newPaths } });

              // ── Single atomic API call ──
              setToggling(true);
              try {
                const result = await cascadePathAccess(server, rule.id, access);
                if (result.updated > 1) {
                  toast.success(`Updated ${result.updated} rules`);
                } else {
                  toast.success(`Access set to ${access}`);
                }
                // Single reload after the atomic operation
                const [fresh, tree] = await Promise.all([
                  getConfig(server as ServerName),
                  getFolders(server).catch(() => ({ folders: [], server: "", count: 0 })),
                ]);
                setConfig(fresh);
                setFolders(tree.folders || []);
              } catch {
                setConfig(prevConfig);
                toast.error("Failed to update");
              } finally {
                setToggling(false);
              }
            }}
          />
        ) : (
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-left">
                  <th className="px-4 py-2 w-[40%]">Path</th>
                  <th className="px-4 py-2 w-[120px]">Access</th>
                  <th className="px-4 py-2 hidden md:table-cell">Description</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {config.permissions.paths
                  .filter((r) => !pathSearch || r.path.toLowerCase().includes(pathSearch.toLowerCase()))
                  .map((rule) => (
                  <tr key={rule.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                    <td className="px-4 py-2 font-mono text-xs align-middle truncate">{rule.path}</td>
                    <td className="px-4 py-2 align-middle">
                      <AccessToggles value={rule.access} onChange={(a) => handleTogglePath(rule.id, a)} />
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs align-middle hidden md:table-cell truncate">{rule.description || ""}</td>
                    <td className="px-4 py-2 align-middle text-center">
                      <button onClick={() => handleDeletePath(rule.id)} className="text-gray-600 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {config.permissions.paths.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-gray-500 text-center">No path rules. Default: {config.permissions.default_access}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Command Rules — only for Ubuntu server */}
      {server === "ubuntu-server" && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Command Permissions</h2>
            <button onClick={() => setShowAddCmd(true)} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
              <Plus size={16} /> Add Command
            </button>
          </div>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-left">
                  <th className="px-4 py-2 w-[40%]">Pattern</th>
                  <th className="px-4 py-2 w-[120px]">Access</th>
                  <th className="px-4 py-2 hidden md:table-cell">Description</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {config.permissions.commands.map((rule) => (
                  <tr key={rule.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                    <td className="px-4 py-2 font-mono text-xs align-middle truncate">{rule.pattern}</td>
                    <td className="px-4 py-2 align-middle">
                      <AccessToggles value={rule.access} onChange={(a) => handleToggleCommand(rule.id, a)} />
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs align-middle hidden md:table-cell truncate">{rule.description || ""}</td>
                    <td className="px-4 py-2 align-middle text-center">
                      <button onClick={() => handleDeleteCommand(rule.id)} className="text-gray-600 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {config.permissions.commands.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-gray-500 text-center">No command rules.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Audit Log */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Audit Log (last 50)</h2>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="Filter log…"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            className="flex-1 min-w-[140px] rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={logAccessFilter}
            onChange={(e) => setLogAccessFilter(e.target.value as AccessLevel | "all")}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All access</option>
            <option value="read">Read</option>
            <option value="write">Write</option>
            <option value="none">None</option>
          </select>
          <select
            value={logResultFilter}
            onChange={(e) => setLogResultFilter(e.target.value as "all" | "allowed" | "denied")}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All results</option>
            <option value="allowed">Allowed</option>
            <option value="denied">Denied</option>
          </select>
          <select
            value={logDateFilter}
            onChange={(e) => setLogDateFilter(e.target.value as "all" | "hour" | "today" | "week")}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All time</option>
            <option value="hour">Last hour</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
          </select>
          {logFiltersActive && (
            <button
              onClick={() => { setLogAccessFilter("all"); setLogResultFilter("all"); setLogDateFilter("all"); }}
              className="px-2 py-1.5 text-xs rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="rounded-lg border border-gray-800 overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900 text-gray-400 text-left">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2 hidden md:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody>
              {visibleAuditLog.map((entry, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{entry.ts?.slice(11, 19) || ""}</td>
                  <td className="px-3 py-1.5 font-mono truncate max-w-60">{entry.target || entry.command || entry.target_type || ""}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${entry.result === "allowed" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                      {entry.result}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600 hidden md:table-cell">{entry.reason || ""}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-gray-500 text-center">No audit entries yet.</td></tr>
              )}
              {auditLog.length > 0 && visibleAuditLog.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-gray-500 text-center">No entries match filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Path Dialog */}
      {showAddPath && (
        <AddRuleDialog
          title="Add Path Rule"
          fields={[{ name: "path", label: "Path", placeholder: "/var/log/**" }, { name: "description", label: "Description", placeholder: "Optional" }]}
          onSave={(data) => handleAddPath(data as { path: string; access: AccessLevel; description?: string })}
          onClose={() => setShowAddPath(false)}
        />
      )}

      {/* Add Command Dialog */}
      {showAddCmd && (
        <AddRuleDialog
          title="Add Command Rule"
          fields={[{ name: "pattern", label: "Pattern", placeholder: "systemctl status *" }, { name: "description", label: "Description", placeholder: "Optional" }]}
          onSave={(data) => handleAddCommand(data as { pattern: string; access: AccessLevel; description?: string })}
          onClose={() => setShowAddCmd(false)}
        />
      )}

      {/* Bulk Confirm Dialog */}
      {bulkConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setBulkConfirm(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Set all {bulkConfirm.type}?</h3>
            <p className="text-sm text-gray-400 mb-4">
              This will change{' '}
              <span className="text-white font-semibold">
                {bulkConfirm.type === "paths" ? config!.permissions.paths.length : config!.permissions.commands.length}
              </span>{' '}
              {bulkConfirm.type} to{' '}
              <span className="text-white font-semibold">{bulkConfirm.access}</span>.
              This cannot be undone in one click.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBulkConfirm(null)} className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700">
                Cancel
              </button>
              <button
                onClick={() => handleBulkSet(bulkConfirm.access, bulkConfirm.type)}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500"
              >
                Yes, set all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Access Toggle Component ─────────────────────────── */

function AccessToggles({ value, onChange }: { value: AccessLevel; onChange: (a: AccessLevel) => void }) {
  const levels: AccessLevel[] = ["none", "read", "write"];
  const colors: Record<AccessLevel, string> = {
    none: "bg-gray-700 text-gray-400",
    read: "bg-blue-600 text-white",
    write: "bg-green-600 text-white",
  };

  return (
    <div className="flex rounded overflow-hidden border border-gray-700">
      {levels.map((level) => (
        <button
          key={level}
          onClick={() => onChange(level)}
          className={`px-2 py-0.5 text-xs font-medium transition-colors ${value === level ? colors[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

/* ── Add Rule Dialog ─────────────────────────────────── */

function AddRuleDialog({
  title,
  fields,
  onSave,
  onClose,
}: {
  title: string;
  fields: { name: string; label: string; placeholder: string }[];
  onSave: (data: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({ access: "read" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
              <input
                type="text"
                placeholder={f.placeholder}
                required={f.name !== "description"}
                value={formData[f.name] || ""}
                onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Access Level</label>
            <AccessToggles value={(formData.access as AccessLevel) || "read"} onChange={(a) => setFormData({ ...formData, access: a })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
