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

function AccessBadge({ access, onChange }: { access: string; onChange?: (a: AccessLevel) => void }) {
  const colors: Record<string, string> = {
    none: "bg-gray-700 text-gray-400",
    read: "bg-blue-900/50 text-blue-400",
    write: "bg-green-900/50 text-green-400",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[access] || colors.none}`}>
      {access}
    </span>
  );
}

function TreeNode({ node, depth, onToggle }: { node: FolderNode; depth: number; onToggle?: (path: string, access: AccessLevel) => void }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 hover:bg-gray-800/50 rounded text-xs"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="text-gray-500 hover:text-white">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-gray-300 flex-1 truncate font-mono">{node.name}</span>
        <span className="text-gray-600 text-[10px] hidden md:inline truncate max-w-32">{node.description}</span>
        <AccessBadge access={node.access} />
      </div>
      {open && hasChildren &&
        node.children.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} onToggle={onToggle} />
        ))
      }
    </div>
  );
}

export default function FolderTree({ folders }: { folders: FolderNode[] }) {
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden max-h-96 overflow-y-auto">
      {folders.length === 0 ? (
        <p className="px-4 py-4 text-gray-500 text-xs text-center">No folders</p>
      ) : (
        folders.map((f) => <TreeNode key={f.path} node={f} depth={0} />)
      )}
    </div>
  );
}
