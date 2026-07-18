"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSettings, updateSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, X } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  /** Add one or more patterns from a raw string (splits on newlines and commas). */
  function addPatterns(raw: string) {
    if (!settings || !raw.trim()) return;
    const patterns = raw
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (patterns.length === 0) return;
    const existing = new Set(settings.scan.excludePatterns);
    const fresh = patterns.filter((p) => !existing.has(p));
    if (fresh.length === 0) {
      setTagInput("");
      return;
    }
    setSettings({
      ...settings,
      scan: {
        ...settings.scan,
        excludePatterns: [...settings.scan.excludePatterns, ...fresh],
      },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addPatterns(tagInput);
      setTagInput("");
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text/plain");
    if (pasted.includes("\n")) {
      e.preventDefault();
      addPatterns(pasted);
    }
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
            <p className="text-xs text-gray-500 mb-2">
              Folder names matching these patterns are skipped during scans. Type and press Enter to add, or paste multiple lines.
            </p>

            {/* Unified tag input */}
            <div
              className="flex flex-wrap items-center gap-1.5 p-2 rounded border border-gray-700 bg-gray-800 cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {settings.scan.excludePatterns.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-700 text-xs text-gray-200">
                  {p}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeExclude(p);
                    }}
                    className="text-gray-400 hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                type="text"
                placeholder={settings.scan.excludePatterns.length === 0 ? "e.g. .venv, node_modules" : "Add pattern…"}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-sm focus:outline-none placeholder-gray-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Press <kbd className="px-1 rounded bg-gray-800 text-gray-400">Enter</kbd> to add a pattern.{" "}
              Paste multiple lines to add them at once.{" "}
              <button
                type="button"
                onClick={() => {
                  if (!settings) return;
                  setSettings({ ...settings, scan: { ...settings.scan, excludePatterns: [] } });
                }}
                className="text-gray-400 hover:text-red-400 underline"
              >
                Clear all
              </button>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
