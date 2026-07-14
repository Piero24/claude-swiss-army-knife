"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSettings, updateSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Plus, X } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newExclude, setNewExclude] = useState("");

  useEffect(() => {
    getSettings().then(setSettings).catch(() => toast.error("Failed to load settings")).finally(() => setLoading(false));
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

  function addExclude() {
    if (!settings || !newExclude.trim()) return;
    if (settings.scan.excludePatterns.includes(newExclude.trim())) return;
    setSettings({
      ...settings,
      scan: { ...settings.scan, excludePatterns: [...settings.scan.excludePatterns, newExclude.trim()] },
    });
    setNewExclude("");
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
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

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
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="e.g. .venv"
                value={newExclude}
                onChange={(e) => setNewExclude(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExclude()}
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={addExclude} className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700"><Plus size={16} /></button>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Bulk paste (one per line):</p>
              <textarea
                rows={4}
                placeholder={"env\nsite-packages\nlib\nsrc"}
                onChange={(e) => {
                  const lines = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
                  if (lines.length > 0) {
                    const merged = [...new Set([...settings.scan.excludePatterns, ...lines])];
                    setSettings({ ...settings, scan: { ...settings.scan, excludePatterns: merged } });
                    e.target.value = "";
                  }
                }}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
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
    </div>
  );
}
