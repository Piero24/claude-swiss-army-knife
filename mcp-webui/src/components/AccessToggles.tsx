"use client";

import type { AccessLevel, CommandAccess } from "@/lib/types";

const ACCESS_LEVELS: AccessLevel[] = ["none", "read", "write"];
const COMMAND_LEVELS: CommandAccess[] = ["none", "active"];

const ACCESS_COLORS: Record<string, string> = {
  none: "bg-gray-700 text-gray-400",
  read: "bg-blue-600 text-white",
  write: "bg-green-600 text-white",
  active: "bg-green-600 text-white",
};

/* ── Access Toggles ─────────────────────────────────── */

interface AccessTogglesProps {
  value: AccessLevel;
  onChange: (a: AccessLevel) => void;
  /** Optional max allowed level — levels above this are disabled */
  maxLevel?: AccessLevel;
}

/**
 * Three-state toggle for path access levels (none | read | write).
 * Extracted from server/page.tsx and FolderTree.tsx where it was duplicated.
 */
export function AccessToggles({ value, onChange, maxLevel = "write" }: AccessTogglesProps) {
  const maxIdx = ACCESS_LEVELS.indexOf(maxLevel);
  return (
    <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
      {ACCESS_LEVELS.map((level, i) => {
        const disabled = i > maxIdx;
        const active = value === level;
        return (
          <button
            key={level}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onChange(level); }}
            className={`px-2 py-1 text-xs font-medium transition-colors
              ${active ? ACCESS_COLORS[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"}
              ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

/* ── Command Toggles ────────────────────────────────── */

interface CommandTogglesProps {
  value: CommandAccess;
  onChange: (a: CommandAccess) => void;
}

/**
 * Two-state toggle for command access (none | active).
 * Extracted from server/page.tsx inline definition.
 */
export function CommandToggles({ value, onChange }: CommandTogglesProps) {
  return (
    <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
      {COMMAND_LEVELS.map((level) => {
        const active = value === level;
        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              active ? ACCESS_COLORS[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"
            }`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}
