"use client";

import { useEffect, useState } from "react";
import { getSettings, updateSettings, getConfig, updateConfig } from "@/lib/api";
import type { AppSettings } from "@/lib/api";
import type { ServerConfig } from "@/lib/types";
import { getServers } from "@/lib/servers";
import type { ServerMeta } from "@/lib/servers";
import { toast } from "sonner";
import { X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Toggle from "@/components/Toggle";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [excludeInput, setExcludeInput] = useState("");

  useEffect(() => {
    Promise.all([
      getSettings().catch(() => null),
      getServers(),
    ]).then(([s, svrs]) => {
      setSettings(s);
      setServers(svrs);
      return Promise.all(svrs.map((sv) => getConfig(sv.name).then((cfg) => [sv.name, cfg] as const).catch(() => null)));
    }).then((cfgs) => {
      const map: Record<string, ServerConfig> = {};
      for (const entry of cfgs) { if (entry) map[entry[0]] = entry[1]; }
      setServerConfigs(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
                  <span className="text-lg">{srv.icon}</span>
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

      {/* Obsidian Connection Mode */}
      {(() => {
        const obsConfig = serverConfigs["obsidian"];
        if (!obsConfig) return null;
        const raw = obsConfig as unknown as Record<string, unknown>;
        const conn = (raw.connection || {}) as Record<string, unknown>;
        const mode = (conn.mode || "local") as string;

        async function setMode(m: string) {
          const updated = { ...obsConfig, connection: { ...conn, mode: m } } as ServerConfig;
          setServerConfigs((prev) => ({ ...prev, obsidian: updated }));
          try { await updateConfig("obsidian", updated); } catch { toast.error("Failed to update"); }
        }

        function missingForMode(m: string): string[] {
          const c = (conn[m] || {}) as Record<string, string>;
          if (m === "local") return c.vault_path ? [] : ["vault_path"];
          if (m === "remote") {
            const missing: string[] = [];
            if (!c.host) missing.push("host");
            if (!c.user) missing.push("user");
            if (!c.vault_path) missing.push("vault_path");
            return missing;
          }
          return [];
        }

        const missing = missingForMode(mode);
        return (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Obsidian Connection</h2>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Mode</label>
                <div className="flex rounded overflow-hidden border border-gray-700 w-fit">
                  {(["local", "remote"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-3 py-1.5 text-xs font-medium ${mode === m ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {missing.length > 0 && (
                <div className="rounded bg-yellow-900/30 border border-yellow-700/50 p-3 text-xs text-yellow-400">
                  Missing credentials for &quot;{mode}&quot;: {missing.join(", ")}.
                  Set them in .env or the obsidian.yaml config file.
                </div>
              )}
              {missing.length === 0 && (
                <div className="rounded bg-green-900/30 border border-green-700/50 p-3 text-xs text-green-400">
                  {mode} mode configured ✓
                </div>
              )}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
