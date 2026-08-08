"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AccessLevel, CommandAccess, AuditEntry, ServerConfig } from "@/lib/types";
import {
  getConfig,
  getFolders,
  getServersStatus,
  updatePathRule,
  updateCommandRule,
  deletePathRule,
  deleteCommandRule,
  addPathRule,
  addCommandRule,
  getAuditLog,
  getSettings,
  bulkSetAccess,
  cascadePathAccess,
  scanServer,
  addToolRule,
  updateToolRule,
  deleteToolRule,
  addLink,
  deleteLink,
  getAgents,
} from "@/lib/api";
import type { FolderNode } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import UserSelector, { type UserItem } from "@/components/common/UserSelector";
import { ServerStatsBar } from "@/components/server/ServerStatsBar";
import { PathRulesSection } from "@/components/server/PathRulesSection";
import { CommandRulesSection } from "@/components/server/CommandRulesSection";
import { ToolRulesSection } from "@/components/server/ToolRulesSection";
import { LinksSection } from "@/components/server/LinksSection";
import { AuditLogSection } from "@/components/server/AuditLogSection";
import { AddRuleDialog, AddLinkModal, BulkConfirmModal } from "@/components/server/ServerModals";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export default function ServerDetailPage() {
  const params = useParams();
  const server = params.server as string;
  const serverLabel = server
    .replace(/-server$/, "")
    .replace(/-mcp$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditPageSize, setAuditPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAddPath, setShowAddPath] = useState(false);
  const [showAddCmd, setShowAddCmd] = useState(false);
  const [showAddTool, setShowAddTool] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{ access: AccessLevel; type: "paths" | "commands" } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem(`lastScan_${server}`) || null;
    return null;
  });
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [serverEnabled, setServerEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  function sectionVisible(name: string): boolean {
    if (!config) return true;
    const raw = config as unknown as Record<string, unknown>;
    const ui = raw.ui as Record<string, unknown> | undefined;
    const sections = (ui?.sections || {}) as Record<string, boolean>;
    return sections[name] !== false;
  }

  const loadData = useCallback(async () => {
    try {
      const uRes = await getAgents().catch(() => ({ users: [] }));
      setUsers(uRes.users || []);
      const stored = typeof window !== "undefined" ? localStorage.getItem("selectedUser") : null;
      const effectiveUser = stored && uRes.users.some((u: UserItem) => u.id === stored)
        ? stored
        : uRes.users[0]?.id || null;
      setSelectedUser(effectiveUser);
      if (effectiveUser) localStorage.setItem("selectedUser", effectiveUser);

      const [cfg, audit, tree, st, settings] = await Promise.all([
        getConfig(server, effectiveUser || undefined),
        getAuditLog(server, auditPageSize, 0),
        getFolders(server, effectiveUser || undefined).catch(() => ({ folders: [], server: "", count: 0 })),
        getServersStatus().catch(() => ({ servers: {} as Record<string, { enabled: boolean }> })),
        getSettings().catch(() => null),
      ]);
      setConfig(cfg);
      setFolders(tree.folders || []);
      setAuditLog(audit.entries);
      setAuditTotal(audit.total);
      setAuditPage(0);
      if (settings?.auditPageSize) setAuditPageSize(settings.auditPageSize);
      const srv = st.servers[server];
      setServerEnabled(!srv || srv.enabled !== false);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [server, auditPageSize]);

  const checkScanStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scan-status");
      const data = await res.json();
      const active: string[] = data.activeServers || (data.server ? data.server.split(", ").filter(Boolean) : []);
      setScanning(active.includes(server));
    } catch {
      /* ignore */
    }
  }, [server]);

  useEffect(() => {
    loadData();
    checkScanStatus();
    const interval = setInterval(checkScanStatus, 3000);
    return () => clearInterval(interval);
  }, [loadData, checkScanStatus]);

  async function loadAuditPage(page: number) {
    setAuditLoading(true);
    try {
      const result = await getAuditLog(server, auditPageSize, page * auditPageSize);
      setAuditLog(result.entries);
      setAuditTotal(result.total);
      setAuditPage(page);
    } catch {
      toast.error("Failed to load audit log");
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleUserChange(val: string) {
    setSelectedUser(val);
    localStorage.setItem("selectedUser", val);
    setLoading(true);
    try {
      const cfg = await getConfig(server, val);
      setConfig(cfg);
    } catch {
      toast.error("Failed to load user config");
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePath(ruleId: string, access: AccessLevel) {
    if (!config) return;
    const prev = structuredClone(config);
    const paths = config.permissions?.paths || [];
    const idx = paths.findIndex((p) => p.id === ruleId);
    if (idx < 0) return;
    const newPaths = paths.map((p, i) => (i === idx ? { ...p, access } : p));
    setConfig({ ...config, permissions: { ...(config.permissions || {}), paths: newPaths } });
    try {
      await updatePathRule(server, ruleId, access, selectedUser);
      toast.success(`Path access set to ${access}`);
    } catch {
      setConfig(prev);
      toast.error("Failed to update");
    }
  }

  async function handleDeletePath(ruleId: string) {
    if (!config) return;
    const prev = structuredClone(config);
    const newPaths = (config.permissions?.paths || []).filter((p) => p.id !== ruleId);
    setConfig({ ...config, permissions: { ...(config.permissions || {}), paths: newPaths } });
    try {
      await deletePathRule(server, ruleId, selectedUser);
      toast.success("Path rule removed");
    } catch {
      setConfig(prev);
      toast.error("Failed to delete");
    }
  }

  async function handleCascadePathAccess(folderPath: string, access: AccessLevel) {
    if (toggling || !config) return;
    const cleanPath = folderPath.replace(/\/\*\*$/, "");
    const rule = config?.permissions?.paths?.find((r) => r.path.replace(/\/\*\*$/, "") === cleanPath);
    if (!rule) return;

    const LEVEL_ORDER: Record<string, number> = { none: 0, read: 1, write: 2 };
    const accessIdx = LEVEL_ORDER[access] ?? 0;
    const prevConfig = structuredClone(config);
    const prefix = cleanPath + "/";

    const newPaths = (config.permissions?.paths || []).map((p) => {
      if (p.id === rule.id) return { ...p, access };
      const childPath = p.path.replace(/\/\*\*$/, "");
      if (childPath.startsWith(prefix)) {
        const childIdx = LEVEL_ORDER[p.access] ?? 0;
        if (childIdx > accessIdx) return { ...p, access };
      }
      return p;
    });
    setConfig({ ...config, permissions: { ...(config.permissions || {}), paths: newPaths } });

    setToggling(true);
    try {
      const result = await cascadePathAccess(server, rule.id, access, selectedUser);
      if (result.updated > 1) {
        toast.success(`Updated ${result.updated} rules`);
      } else {
        toast.success(`Access set to ${access}`);
      }
      const [fresh, tree] = await Promise.all([
        getConfig(server, selectedUser || undefined),
        getFolders(server, selectedUser || undefined).catch(() => ({ folders: [], server: "", count: 0 })),
      ]);
      setConfig(fresh);
      setFolders(tree.folders || []);
    } catch {
      setConfig(prevConfig);
      toast.error("Failed to update");
    } finally {
      setToggling(false);
    }
  }

  async function handleAddPath(data: { path: string; access: AccessLevel; description?: string }) {
    try {
      await addPathRule(server, data, selectedUser);
      toast.success("Path rule added");
      setShowAddPath(false);
      loadData();
    } catch {
      toast.error("Failed to add rule");
    }
  }

  async function handleToggleCommand(ruleId: string, access: CommandAccess) {
    if (!config) return;
    const prev = structuredClone(config);
    const commands = config.permissions?.commands || [];
    const idx = commands.findIndex((c) => c.id === ruleId);
    if (idx < 0) return;
    const newCommands = commands.map((c, i) => (i === idx ? { ...c, access } : c));
    setConfig({ ...config, permissions: { ...(config.permissions || {}), commands: newCommands } });
    try {
      await updateCommandRule(server, ruleId, access, selectedUser);
      toast.success(`Command access set to ${access}`);
    } catch {
      setConfig(prev);
      toast.error("Failed to update");
    }
  }

  async function handleDeleteCommand(ruleId: string) {
    if (!config) return;
    const prev = structuredClone(config);
    const newCommands = (config.permissions?.commands || []).filter((c) => c.id !== ruleId);
    setConfig({ ...config, permissions: { ...(config.permissions || {}), commands: newCommands } });
    try {
      await deleteCommandRule(server, ruleId, selectedUser);
      toast.success("Command rule removed");
    } catch {
      setConfig(prev);
      toast.error("Failed to delete");
    }
  }

  async function handleAddCommand(data: { pattern: string; access: CommandAccess; description?: string }) {
    try {
      await addCommandRule(server, data, selectedUser);
      toast.success("Command rule added");
      setShowAddCmd(false);
      loadData();
    } catch {
      toast.error("Failed to add rule");
    }
  }

  async function handleBulkSet(access: AccessLevel, type: "paths" | "commands") {
    if (!config) return;
    try {
      await bulkSetAccess(server, access, type, selectedUser);
      toast.success(`All ${type} set to ${access}`);
      setBulkConfirm(null);
      loadData();
      getFolders(server, selectedUser || undefined)
        .then((t) => setFolders(t.folders || []))
        .catch(() => {});
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleAddTool(data: { pattern: string; access: "none" | "active"; description?: string }) {
    if (!config) return;
    try {
      const res = await addToolRule(server, data, selectedUser);
      setConfig({
        ...config,
        permissions: {
          ...config.permissions,
          tools: [...(config.permissions.tools || []), { ...data, id: res.rule.id }],
        },
      });
      toast.success("Tool rule added");
      setShowAddTool(false);
    } catch {
      toast.error("Failed to add tool rule");
    }
  }

  async function handleUpdateTool(ruleId: string, access: "none" | "active") {
    if (!config) return;
    const prev = structuredClone(config);
    const tools = [...(config.permissions.tools || [])];
    const idx = tools.findIndex((t) => t.id === ruleId);
    if (idx >= 0) tools[idx] = { ...tools[idx], access };
    setConfig({ ...config, permissions: { ...config.permissions, tools } });
    try {
      await updateToolRule(server, ruleId, access, selectedUser);
    } catch {
      setConfig(prev);
      toast.error("Failed to update");
    }
  }

  async function handleDeleteTool(ruleId: string) {
    if (!config) return;
    const prev = structuredClone(config);
    setConfig({
      ...config,
      permissions: {
        ...config.permissions,
        tools: (config.permissions.tools || []).filter((t) => t.id !== ruleId),
      },
    });
    try {
      await deleteToolRule(server, ruleId, selectedUser);
      toast.success("Tool rule removed");
    } catch {
      setConfig(prev);
      toast.error("Failed to delete");
    }
  }

  async function handleScan() {
    setScanning(true);
    const started = Date.now();
    try {
      const res = await scanServer(server, selectedUser);
      const elapsed = Date.now() - started;
      const dur =
        elapsed < 60000
          ? `${(elapsed / 1000).toFixed(0)}s`
          : `${Math.floor(elapsed / 60000)}m ${Math.round((elapsed % 60000) / 1000)}s`;
      if (res.added > 0) {
        toast.success(`Found ${res.added} folder${res.added > 1 ? "s" : ""} in ${dur}`);
      } else if (res.message) {
        toast.info(res.message);
      } else {
        toast.success(`Scan complete: ${res.total} folders (${dur})`);
      }
      await loadData();
      const label = `${new Date().toLocaleTimeString()} (${dur})`;
      setLastScan(label);
      if (typeof window !== "undefined") localStorage.setItem(`lastScan_${server}`, label);
    } catch (err) {
      if (err instanceof Error && err.message !== "Unauthorized")
        toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleCancelScan() {
    try {
      await fetch(`/api/scan/${server}/cancel`, { method: "POST" });
      toast.success("Scan cancelled");
    } catch {
      /* ignore */
    }
  }

  async function handleAddLinkSubmit(data: { name: string; url: string; category?: string; tags?: string; description?: string }) {
    if (!data.name || !data.url) {
      toast.error("Name and URL are required");
      return;
    }
    try {
      const tagsArray = (data.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await addLink(server, {
        name: data.name,
        url: data.url,
        description: data.description || undefined,
        category: data.category || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      });
      toast.success("Link added successfully");
      setShowAddLink(false);
      loadData();
    } catch {
      toast.error("Failed to add link");
    }
  }

  async function handleDeleteLink(linkNameOrUrl: string) {
    if (!config) return;
    const prev = structuredClone(config);
    const newLinks = (config.links || []).filter((l) => l.name !== linkNameOrUrl && l.url !== linkNameOrUrl);
    setConfig({ ...config, links: newLinks });
    try {
      await deleteLink(server, linkNameOrUrl, selectedUser);
      toast.success("Link removed");
    } catch {
      setConfig(prev);
      toast.error("Failed to delete link");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-400">Failed to load config</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <PageHeader
        title={serverLabel}
        backHref="/"
        actions={
          <div className="flex items-center gap-4">
            <UserSelector users={users} selectedUser={selectedUser} onChange={handleUserChange} />
            {["synology-nas", "obsidian", "ubuntu-server"].includes(server) && (
              <>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
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
              </>
            )}
          </div>
        }
      />

      {!serverEnabled && (
        <div className="mb-6 rounded-lg border border-yellow-800 bg-yellow-900/30 p-4 flex items-center gap-3">
          <span className="text-yellow-400 text-lg">⏸</span>
          <div>
            <p className="text-yellow-300 font-semibold text-sm">Server Deactivated</p>
            <p className="text-yellow-500 text-xs">
              This server is currently disabled. Tools are unavailable until reactivated from the dashboard.
            </p>
          </div>
        </div>
      )}

      <ServerStatsBar server={server} />

      {sectionVisible("paths") && (
        <PathRulesSection
          config={config}
          folders={folders}
          toggling={toggling}
          onTogglePath={handleTogglePath}
          onDeletePath={handleDeletePath}
          onCascadePathAccess={handleCascadePathAccess}
          onOpenAddPathModal={() => setShowAddPath(true)}
          onOpenBulkConfirm={(access) => setBulkConfirm({ access, type: "paths" })}
        />
      )}

      {sectionVisible("commands") && (
        <CommandRulesSection
          config={config}
          onToggleCommand={handleToggleCommand}
          onDeleteCommand={handleDeleteCommand}
          onOpenAddCommandModal={() => setShowAddCmd(true)}
        />
      )}

      {sectionVisible("tools") && (
        <ToolRulesSection
          config={config}
          onUpdateTool={handleUpdateTool}
          onDeleteTool={handleDeleteTool}
          onOpenAddToolModal={() => setShowAddTool(true)}
        />
      )}

      {(server === "link-manager" || server === "link-manager-mcp") && (
        <LinksSection
          config={config}
          onDeleteLink={handleDeleteLink}
          onOpenAddLinkModal={() => setShowAddLink(true)}
        />
      )}

      {sectionVisible("audit") && (
        <AuditLogSection
          auditLog={auditLog}
          auditTotal={auditTotal}
          auditPage={auditPage}
          auditPageSize={auditPageSize}
          auditLoading={auditLoading}
          onLoadAuditPage={loadAuditPage}
        />
      )}

      <AddRuleDialog
        open={showAddPath}
        title="Add Path Rule"
        fields={[
          { name: "path", label: "Path", placeholder: "/var/log/**" },
          { name: "description", label: "Description", placeholder: "Optional" },
        ]}
        onSave={(data) => handleAddPath(data as { path: string; access: AccessLevel; description?: string })}
        onClose={() => setShowAddPath(false)}
      />

      <AddRuleDialog
        open={showAddCmd}
        title="Add Command Rule"
        fields={[
          { name: "pattern", label: "Pattern", placeholder: "systemctl status *" },
          { name: "description", label: "Description", placeholder: "Optional" },
        ]}
        onSave={(data) => handleAddCommand(data as { pattern: string; access: CommandAccess; description?: string })}
        onClose={() => setShowAddCmd(false)}
        commandAccess
      />

      <AddRuleDialog
        open={showAddTool}
        title="Add Tool Rule"
        fields={[
          { name: "pattern", label: "Pattern", placeholder: "search_*" },
          { name: "description", label: "Description", placeholder: "Optional" },
        ]}
        onSave={(data) => handleAddTool(data as { pattern: string; access: "none" | "active"; description?: string })}
        onClose={() => setShowAddTool(false)}
        commandAccess
      />

      <AddLinkModal
        open={showAddLink}
        onClose={() => setShowAddLink(false)}
        onSubmit={handleAddLinkSubmit}
      />

      <BulkConfirmModal
        bulkConfirm={bulkConfirm}
        totalItems={
          bulkConfirm
            ? bulkConfirm.type === "paths"
              ? (config.permissions?.paths || []).length
              : (config.permissions?.commands || []).length
            : 0
        }
        onConfirm={handleBulkSet}
        onClose={() => setBulkConfirm(null)}
      />
    </div>
  );
}