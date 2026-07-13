"use client";

import { useState } from "react";
import type { AccessLevel } from "@/lib/types";
import { ChevronRight, ChevronDown, Lock } from "lucide-react";

interface FolderNode {
  name: string;
  path: string;
  access: string;
  description: string;
  children: FolderNode[];
}

const LEVEL_ORDER: AccessLevel[] = ["none", "read", "write"];

function maxChildAccess(parentAccess: string): AccessLevel {
  if (parentAccess === "none") return "none";
  if (parentAccess === "read") return "read";
  return "write";
}

function levelIndex(level: string): number {
  return LEVEL_ORDER.indexOf(level as AccessLevel);
}

/** Count total nodes in the tree (including root). */
function countNodes(folders: FolderNode[]): number {
  let n = 0;
  for (const f of folders) { n += 1 + countNodes(f.children); }
  return n;
}

/** Count all descendants recursively. */
function countDescendants(node: FolderNode): number {
  let n = node.children.length;
  for (const c of node.children) n += countDescendants(c);
  return n;
}

function AccessToggles({
  value,
  maxLevel,
  onChange,
}: {
  value: string;
  maxLevel: AccessLevel;
  onChange?: (a: AccessLevel) => void;
}) {
  const maxIdx = levelIndex(maxLevel);
  return (
    <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
      {LEVEL_ORDER.map((level, i) => {
        const disabled = i > maxIdx;
        const active = value === level;
        const colors: Record<string, string> = {
          none: "bg-gray-700 text-gray-400",
          read: "bg-blue-600 text-white",
          write: "bg-green-600 text-white",
        };
        return (
          <button
            key={level}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onChange?.(level); }}
            className={`px-2 py-1 text-xs font-medium transition-colors
              ${active ? colors[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"}
              ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  parentAccess,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  parentAccess: AccessLevel;
  onToggle?: (path: string, access: AccessLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const childCount = countDescendants(node);
  const maxAccess = maxChildAccess(parentAccess);
  const restricted = levelIndex(node.access) > levelIndex(maxAccess);

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-800/50 text-sm border-b border-gray-800/50"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="text-gray-500 hover:text-white shrink-0">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="text-gray-300 flex-1 truncate font-mono text-sm min-w-0">
          {node.name}
          {childCount > 0 && (
            <span className="text-gray-600 ml-1 text-xs">({childCount})</span>
          )}
        </span>
        {node.description && (
          <span className="text-gray-500 text-xs truncate hidden sm:inline-block max-w-[200px] shrink-0" title={node.description}>
            {node.description}
          </span>
        )}
        {restricted && <Lock size={12} className="text-gray-600 shrink-0" />}
        <AccessToggles
          value={node.access}
          maxLevel={maxChildAccess(parentAccess)}
          onChange={(a) => onToggle?.(node.path, a)}
        />
      </div>
      {open && hasChildren &&
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            parentAccess={node.access as AccessLevel}
            onToggle={onToggle}
          />
        ))
      }
    </div>
  );
}

export default function FolderTree({
  folders,
  onToggle,
}: {
  folders: FolderNode[];
  onToggle?: (path: string, access: AccessLevel) => void;
}) {
  const total = countNodes(folders);

  if (folders.length === 0) {
    return <p className="px-4 py-4 text-gray-500 text-sm text-center">No folders</p>;
  }
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{total} folder{total !== 1 ? "s" : ""}</p>
      <div className="rounded-lg border border-gray-800 overflow-hidden max-h-[65vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-2 py-1.5 px-2 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 sticky top-0 z-10">
          <span className="w-4 shrink-0" />
          <span className="flex-1 min-w-0">Path</span>
          <span className="hidden sm:inline-block w-[200px] shrink-0">Description</span>
          <span className="w-30 shrink-0">Access</span>
        </div>
        {folders.map((f) => (
          <TreeNode key={f.path} node={f} depth={0} parentAccess="write" onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}
