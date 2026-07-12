"use client";

import { useState } from "react";
import type { AccessLevel } from "@/lib/types";
import { ChevronRight, ChevronDown } from "lucide-react";

interface FolderNode {
  name: string;
  path: string;
  access: string;
  description: string;
  children: FolderNode[];
}

function AccessToggles({ value, onChange }: { value: string; onChange?: (a: AccessLevel) => void }) {
  const levels: AccessLevel[] = ["none", "read", "write"];
  const colors: Record<string, string> = {
    none: "bg-gray-700 text-gray-400",
    read: "bg-blue-600 text-white",
    write: "bg-green-600 text-white",
  };
  return (
    <div className="flex rounded overflow-hidden border border-gray-700">
      {levels.map((level) => (
        <button
          key={level}
          onClick={(e) => { e.stopPropagation(); onChange?.(level); }}
          className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${value === level ? colors[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

function TreeNode({ node, depth, onToggle }: { node: FolderNode; depth: number; onToggle?: (path: string, access: AccessLevel) => void }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-gray-800/50 rounded text-xs border-b border-gray-800/50"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="text-gray-500 hover:text-white shrink-0">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="text-gray-300 flex-1 truncate font-mono">{node.name}</span>
        <span className="text-gray-600 text-[10px] hidden md:inline truncate max-w-32">{node.description}</span>
        <AccessToggles value={node.access} onChange={(a) => onToggle?.(node.path, a)} />
      </div>
      {open && hasChildren &&
        node.children.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} onToggle={onToggle} />
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
  if (folders.length === 0) {
    return <p className="px-4 py-4 text-gray-500 text-xs text-center">No folders</p>;
  }
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden max-h-[60vh] overflow-y-auto">
      {folders.map((f) => <TreeNode key={f.path} node={f} depth={0} onToggle={onToggle} />)}
    </div>
  );
}
