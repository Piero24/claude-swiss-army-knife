"use client";

import { useEffect, useState } from "react";
import { getSettings, updateSettings, getConfig, updateConfig, getServersStatus, bulkToggleServers, toggleServerStatus } from "@/lib/api";
import type { AppSettings } from "@/lib/api";
import type { ServerConfig } from "@/lib/types";
import { getServers } from "@/lib/servers";
import type { ServerMeta } from "@/lib/servers";
import { toast } from "sonner";
import { X, Shield } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Toggle from "@/components/Toggle";
import { ServerIcon } from "@/components/ServerIcon";

interface ServerSections {
  paths: boolean;
  commands: boolean;
  tools: boolean;
  audit: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [servers, setServers] = useState<ServerMeta[]>([]);
  const [serverConfigs, setServerConfigs] = useState<Record<string, ServerConfig>>({});
  const [serverStatus, setServerStatus] = useState<Record<string, { enabled?: boolean }>>({});
  const [masterDisabled, setMasterDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [excludeInput, setExcludeInput] = useState("");

  useEffect(() => {
    Promise.all([
      getSettings().catch(() => null),
      getServers(),
      getServersStatus().catch(() => ({ servers: {} })),
    ]).then(([s, svrs, st]) => {
      setSettings(s);
      setServers(svrs);
      const stMap = (st.servers || {}) as Record<string, { enabled?: boolean }>;
      setServerStatus(stMap);
      const allDisabled = svrs.length > 0 && svrs.every((sv) => stMap[sv.name]?.enabled === false);
      setMasterDisabled(allDisabled);
      return Promise.all(svrs.map((sv) => getConfig(sv.name).then((cfg) => [sv.name, cfg] as const).catch(() => null)));
    }).then((cfgs) => {
      const map: Record<string, ServerConfig> = {};
      for (const entry of cfgs) { if (entry) map[entry[0]] = entry[1]; }
      setServerConfigs(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleMasterDisable(disable: boolean) {
    setMasterDisabled(disable);
    try {
      await bulkToggleServers(!disable);
      toast.success(disable ? "All MCP servers disabled" : "All MCP servers enabled");
      const st = await getServersStatus().catch(() => ({ servers: {} }));
      setServerStatus((st.servers || {}) as Record<string, { enabled?: boolean }>);
    } catch {
      setMasterDisabled(!disable);
      toast.error("Failed to update master status");
    }
  }

  async function handleGlobalServerToggle(server: string, enabled: boolean) {
    setServerStatus((prev) => ({
      ...prev,
      [server]: { ...(prev[server] || {}), enabled },
    }));
    try {
      await toggleServerStatus(server, enabled);
      toast.success(`Global ${server} ${enabled ? "enabled" : "disabled"}`);
    } catch {
      setServerStatus((prev) => ({
        ...prev,
        [server]: { ...(prev[server] || {}), enabled: !enabled },
      }));
      toast.error("Failed to update server status");
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await updateSettings(settings);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSectionToggle(server: string, section: string, value: boolean) {
    const cfg = serverConfigs[server];
    if (!cfg) return;
    const raw = cfg as unknown as Record<string, unknown>;
    const ui = (raw.ui || {}) as Record<string, unknown>;
    const sections = (ui.sections || {}) as Record<string, boolean>;
    const updated = {
      ...cfg,
      ui: { ...ui, sections: { ...sections, [section]: value } },
    } as ServerConfig;
    setServerConfigs((prev) => ({ ...prev, [server]: updated }));
    try {
      await updateConfig(server, updated);
    } catch {
      toast.error("Failed to update");
    }
  }

  function getSections(name: string): ServerSections {
    const cfg = serverConfigs[name];
    if (!cfg) return { paths: true, commands: true, tools: true, audit: true };
    const raw = cfg as unknown as Record<string, unknown>;
    const ui = raw.ui as Record<string, unknown> | undefined;
    return { paths: true, commands: true, tools: true, audit: true, ...(ui?.sections || {}) };
  }

  function addExcludeTag() {
    if (!settings) return;
    const value = excludeInput.trim().replace(/,$/, "");
    if (!value || settings.scan.excludePatterns.includes(value)) {
      setExcludeInput("");
      return;
    }
    setSettings({
      ...settings,
      scan: { ...settings.scan, excludePatterns: [...settings.scan.excludePatterns, value] },
    });
    setExcludeInput("");
  }

  function removeExclude(pattern: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      scan: { ...settings.scan, excludePatterns: settings.scan.excludePatterns.filter((p) => p !== pattern) },
    });
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-400">Loading...</p></div>;
  if (!settings) return <div className="flex min-h-screen items-center justify-center"><p className="text-red-400">Failed to load</p></div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <PageHeader
        title="Settings"
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

      {/* Scan Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Scan</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Auto-scan interval (minutes)</label>
            <input
              type="number"
              min={1} max={1440}
              value={settings.scan.intervalMinutes}
              onChange={(e) => setSettings({
                ...settings,
                scan: { ...settings.scan, intervalMinutes: parseInt(e.target.value) || 5 },
              })}
              className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Max scan duration (seconds)</label>
            <p className="text-xs text-gray-500 mb-1">Set to -1 for unlimited scan time until complete, or enter max seconds (e.g. 60, 300).</p>
            <input
              type="number"
              min={-1}
              value={settings.scan.timeoutSeconds ?? -1}
              onChange={(e) => setSettings({
                ...settings,
                scan: { ...settings.scan, timeoutSeconds: isNaN(parseInt(e.target.value)) ? -1 : parseInt(e.target.value) },
              })}
              className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Exclude patterns</label>
            <p className="text-xs text-gray-500 mb-2">Folder names matching these patterns are skipped during scans.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {settings.scan.excludePatterns.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-300">
                  {p}
                  <button onClick={() => removeExclude(p)} className="text-gray-500 hover:text-red-400"><X size={12} /></button>
                </span>
              ))}
              {settings.scan.excludePatterns.length === 0 && (
                <span className="text-xs text-gray-500">No patterns</span>
              )}
            </div>
            <input
              type="text"
              placeholder="Type a pattern and press Enter or comma. Paste multiple lines to bulk add."
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExcludeTag();
                } else if (e.key === ",") {
                  e.preventDefault();
                  addExcludeTag();
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (pasted.includes("\n")) {
                  e.preventDefault();
                  const lines = pasted.split("\n").map((l) => l.trim()).filter(Boolean);
                  if (lines.length > 0) {
                    const merged = [...new Set([...settings.scan.excludePatterns, ...lines])];
                    setSettings({ ...settings, scan: { ...settings.scan, excludePatterns: merged } });
                  }
                }
              }}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Audit Log Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Audit Log</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Entries per page</label>
            <select
              value={settings.auditPageSize || 50}
              onChange={(e) => setSettings({ ...settings, auditPageSize: parseInt(e.target.value) as 50 | 100 | 150 })}
              className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={150}>150</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Log retention (months)</label>
            <p className="text-xs text-gray-500 mb-1">
              Rotated audit logs older than this are deleted. Active audit.log is never removed. Range: 1–60 months.
            </p>
            <input
              type="number"
              min={1} max={60}
              value={settings.logRetentionMonths ?? 12}
              onChange={(e) => setSettings({
                ...settings,
                logRetentionMonths: Math.max(1, Math.min(60, parseInt(e.target.value) || 12)),
              })}
              className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Synology MCP Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Synology MCP</h2>
        <p className="text-xs text-gray-500 mb-4">These settings are passed to the Synology NAS MCP server.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max download size (MB)</label>
            <p className="text-xs text-gray-500 mb-1">Files larger than this are rejected by syno_file_read. Range: 1–10240 MB.</p>
            <input
              type="number" min={1} max={10240}
              value={settings.synology?.maxDownloadMb ?? 100}
              onChange={(e) => setSettings({
                ...settings,
                synology: { ...(settings.synology || { maxDownloadMb: 100, defaultSearchPath: "/home" }), maxDownloadMb: parseInt(e.target.value) || 100 },
              })}
              className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Default search path</label>
            <p className="text-xs text-gray-500 mb-1">Default folder for syno_file_search when none is specified.</p>
            <input
              type="text"
              value={settings.synology?.defaultSearchPath ?? "/home"}
              onChange={(e) => setSettings({
                ...settings,
                synology: { ...(settings.synology || { maxDownloadMb: 100, defaultSearchPath: "/home" }), defaultSearchPath: e.target.value },
              })}
              className="w-full max-w-xs rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Server Sections */}
      {servers.length > 0 && <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Server Page Sections</h2>
        <p className="text-xs text-gray-500 mb-4">Choose which sections appear on each server detail page.</p>
        <div className="space-y-3">
          {servers.map((srv) => {
            const sec = getSections(srv.name);
            return (
              <div key={srv.name} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ServerIcon icon={srv.icon} className="w-5 h-5 flex items-center justify-center shrink-0" />
                  <span className="font-medium text-sm">{srv.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["paths", "commands", "tools", "audit"] as const).map((key) => (
                    <label key={key} className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer">
                      <span className="text-xs text-gray-400 capitalize">{key}</span>
                      <Toggle
                        checked={sec[key]}
                        onChange={(v) => handleSectionToggle(srv.name, key, v)}
                        label={`Show ${key}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>}

      {/* Security Area — Master Killswitch & Global Per-MCP Controls */}
      <section className="mb-8 p-4 rounded-lg border border-red-900/50 bg-red-950/20">
        <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
          <Shield size={20} /> Security Area & Global Controls
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Emergency controls to disable MCP servers globally for all users.
        </p>

        {/* Emergency Master Killswitch */}
        <div className="flex items-center justify-between p-3 rounded bg-gray-900 border border-gray-800 mb-4">
          <div>
            <span className="font-medium text-sm text-gray-200">Emergency Master Disable</span>
            <p className="text-xs text-gray-500">Deactivates ALL MCP servers for all users immediately.</p>
          </div>
          <Toggle
            checked={masterDisabled}
            onChange={(v) => handleMasterDisable(v)}
            label="Master Disable All"
          />
        </div>

        {/* Global Per-MCP Controls */}
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Global Per-MCP Controls</h3>
        <p className="text-xs text-gray-500 mb-3">Deactivate specific MCP servers globally across all users.</p>
        <div className="space-y-2">
          {servers.map((srv) => {
            const isGloballyEnabled = !serverStatus[srv.name] || serverStatus[srv.name].enabled !== false;
            return (
              <div key={srv.name} className="flex items-center justify-between p-2.5 rounded bg-gray-900 border border-gray-800">
                <div className="flex items-center gap-2">
                  <ServerIcon icon={srv.icon} className="w-5 h-5 flex items-center justify-center shrink-0" />
                  <span className="text-sm font-medium text-gray-300">{srv.label}</span>
                </div>
                <Toggle
                  checked={isGloballyEnabled && !masterDisabled}
                  disabled={masterDisabled}
                  onChange={(v) => handleGlobalServerToggle(srv.name, v)}
                  label={`Global ${srv.label}`}
                />
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}
