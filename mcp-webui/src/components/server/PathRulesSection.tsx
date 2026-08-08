"use client";

import React, { useState } from "react";
import type { AccessLevel, PathRule, ServerConfig } from "@/lib/types";
import type { FolderNode } from "@/lib/api";
import FolderTree from "@/components/FolderTree";
import DataTable, { type Column } from "@/components/DataTable";
import { AccessToggles } from "@/components/AccessToggles";
import { Folders, Plus, Trash2 } from "lucide-react";

interface PathRulesSectionProps {
  config: ServerConfig;
  folders: FolderNode[];
  toggling: boolean;
  onTogglePath: (ruleId: string, access: AccessLevel) => void;
  onDeletePath: (ruleId: string) => void;
  onCascadePathAccess: (folderPath: string, access: AccessLevel) => void;
  onOpenAddPathModal: () => void;
  onOpenBulkConfirm: (access: AccessLevel) => void;
}

export function PathRulesSection({
  config,
  folders,
  toggling,
  onTogglePath,
  onDeletePath,
  onCascadePathAccess,
  onOpenAddPathModal,
  onOpenBulkConfirm,
}: PathRulesSectionProps) {
  const [pathSearch, setPathSearch] = useState("");
  const [pathAccessFilter, setPathAccessFilter] = useState<AccessLevel | "all">("all");
  const [collapseKey, setCollapseKey] = useState(0);

  // Filter tree recursively by access level
  function filterTreeByAccess(nodes: FolderNode[], access: string): FolderNode[] {
    return nodes.reduce((acc, node) => {
      const filteredChildren = filterTreeByAccess(node.children, access);
      if (node.access === access || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, [] as FolderNode[]);
  }

  let visibleFolders = folders;
  if (pathAccessFilter !== "all") {
    visibleFolders = filterTreeByAccess(visibleFolders, pathAccessFilter);
  }
  if (pathSearch) {
    const q = pathSearch.toLowerCase();
    visibleFolders = visibleFolders.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }

  const pathColumns: Column<PathRule>[] = [
    {
      key: "path",
      header: "Path",
      headerClassName: "w-[40%]",
      cellClassName: "font-mono text-xs truncate",
      render: (r) => r.path,
    },
    {
      key: "access",
      header: "Access",
      headerClassName: "w-[120px]",
      render: (r) => (
        <AccessToggles value={r.access} onChange={(a) => onTogglePath(r.id, a)} />
      ),
    },
    {
      key: "description",
      header: "Description",
      headerClassName: "hidden md:table-cell",
      cellClassName: "text-gray-500 text-xs hidden md:table-cell truncate",
      render: (r) => r.description || "",
    },
    {
      key: "delete",
      header: "",
      headerClassName: "w-10",
      cellClassName: "text-center",
      render: (r) => (
        <button
          onClick={() => onDeletePath(r.id)}
          className="text-gray-600 hover:text-red-400"
          title="Delete path rule"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Path Permissions</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 mr-1">Set all:</span>
          {(["none", "read", "write"] as AccessLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => onOpenBulkConfirm(level)}
              className="px-2 py-0.5 text-xs rounded border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
            >
              {level}
            </button>
          ))}
          <button
            onClick={onOpenAddPathModal}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 ml-3 font-medium"
          >
            <Plus size={16} /> Add
          </button>
          <button
            onClick={() => setCollapseKey((k) => k + 1)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white ml-2"
            title="Collapse all folders"
          >
            <Folders size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          placeholder="Filter folders…"
          value={pathSearch}
          onChange={(e) => setPathSearch(e.target.value)}
          className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-200"
        />
        <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
          {(["all", "none", "read", "write"] as const).map((level) => {
            const active = pathAccessFilter === level;
            const colors: Record<string, string> = {
              all: "bg-gray-700 text-gray-300",
              none: "bg-gray-600 text-gray-300",
              read: "bg-blue-600 text-white",
              write: "bg-green-600 text-white",
            };
            return (
              <button
                key={level}
                onClick={() => setPathAccessFilter(level)}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  active ? colors[level] : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {folders.length > 0 ? (
        <FolderTree
          key={collapseKey}
          folders={visibleFolders}
          disabled={toggling}
          onToggle={onCascadePathAccess}
        />
      ) : (
        <DataTable
          columns={pathColumns}
          data={(config.permissions?.paths || []).filter(
            (r) => !pathSearch || r.path.toLowerCase().includes(pathSearch.toLowerCase())
          )}
          rowKey={(r) => r.id}
          emptyMessage={`No path rules. Default: ${config.permissions?.default_access || "none"}`}
        />
      )}
    </section>
  );
}
