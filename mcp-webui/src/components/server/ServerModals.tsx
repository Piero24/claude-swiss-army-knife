"use client";

import React, { useState } from "react";
import Modal from "@/components/Modal";
import { AccessToggles, CommandToggles } from "@/components/AccessToggles";
import type { AccessLevel, CommandAccess } from "@/lib/types";

export function AddRuleDialog({
  open,
  title,
  fields,
  onSave,
  onClose,
  commandAccess,
}: {
  open: boolean;
  title: string;
  fields: { name: string; label: string; placeholder: string }[];
  onSave: (data: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
  commandAccess?: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({ access: commandAccess ? "active" : "read" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
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
          {commandAccess ? (
            <CommandToggles value={(formData.access as CommandAccess) || "active"} onChange={(a) => setFormData({ ...formData, access: a })} />
          ) : (
            <AccessToggles value={(formData.access as AccessLevel) || "read"} onChange={(a) => setFormData({ ...formData, access: a })} />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700">Cancel</button>
          <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AddLinkModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; url: string; category?: string; tags?: string; description?: string }) => void | Promise<void>;
}) {
  const [formData, setFormData] = useState({ name: "", url: "", description: "", category: "documentation", tags: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(formData);
    setFormData({ name: "", url: "", description: "", category: "documentation", tags: "" });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Link">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            placeholder="e.g. Claude Docs"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">URL *</label>
          <input
            type="url"
            placeholder="https://docs.anthropic.com"
            required
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Category</label>
          <input
            type="text"
            placeholder="e.g. documentation, development, tools"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Tags (comma separated)</label>
          <input
            type="text"
            placeholder="e.g. claude, docs, official"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input
            type="text"
            placeholder="Optional description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Add Link
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function BulkConfirmModal({
  bulkConfirm,
  totalItems,
  onConfirm,
  onClose,
}: {
  bulkConfirm: { access: AccessLevel; type: "paths" | "commands" } | null;
  totalItems: number;
  onConfirm: (access: AccessLevel, type: "paths" | "commands") => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      open={bulkConfirm !== null}
      onClose={onClose}
      title={bulkConfirm ? `Set all ${bulkConfirm.type}?` : ""}
      maxWidth="max-w-sm"
    >
      {bulkConfirm && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            This will change{" "}
            <span className="text-white font-semibold">{totalItems}</span>{" "}
            {bulkConfirm.type} to{" "}
            <span className="text-white font-semibold">{bulkConfirm.access}</span>.
            This cannot be undone in one click.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700">
              Cancel
            </button>
            <button
              onClick={() => onConfirm(bulkConfirm.access, bulkConfirm.type)}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500"
            >
              Yes, set all
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
