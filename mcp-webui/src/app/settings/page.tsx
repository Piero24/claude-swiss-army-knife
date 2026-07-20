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

      {/* Provider API Keys */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">AI Provider API Keys</h2>
        <p className="text-xs text-gray-500 mb-4">
          Add API keys to enable token usage and cost tracking on the dashboard stats.
          Keys are stored in settings.json and never sent to third parties.
        </p>
        <div className="space-y-4">
          <ProviderKeyInput
            label="Anthropic Admin Key"
            provider="anthropic"
            description="Admin API key from console.anthropic.com (NOT your inference key). Required for the Messages Usage API."
            value={settings.providerKeys?.anthropicAdminKey || ""}
            onChange={(v) => setSettings({
              ...settings,
              providerKeys: { ...(settings.providerKeys || {}), anthropicAdminKey: v },
            })}
          />
          <ProviderKeyInput
            label="DeepSeek API Key"
            provider="deepseek"
            description="Standard API key from platform.deepseek.com. Used to query the /v1/usage endpoint."
            value={settings.providerKeys?.deepseekKey || ""}
            onChange={(v) => setSettings({
              ...settings,
              providerKeys: { ...(settings.providerKeys || {}), deepseekKey: v },
            })}
          />
          <ProviderKeyInput
            label="OpenRouter API Key"
            provider="openrouter"
            description="Standard API key from openrouter.ai. Used to query the /auth/key and activity endpoints."
            value={settings.providerKeys?.openrouterKey || ""}
            onChange={(v) => setSettings({
              ...settings,
              providerKeys: { ...(settings.providerKeys || {}), openrouterKey: v },
            })}
          />
          <div className="rounded-lg border border-gray-800/50 bg-gray-900/50 p-4 opacity-75">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-500">Google Gemini</span>
              <span className="text-xs text-gray-600">Not available</span>
            </div>
            <p className="text-xs text-gray-600">
              Google does not expose a simple usage REST API. Track Gemini usage via{" "}
              <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener" className="text-blue-500 underline">
                Google Cloud Console → Billing Reports
              </a>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProviderKeyInput({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  provider: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <button
          onClick={() => setShow(!show)}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={show ? `sk-...` : "••••••••"}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {value && (
        <p className="text-xs text-green-500/70 mt-1">Key configured ✓</p>
      )}
    </div>
  );
}
