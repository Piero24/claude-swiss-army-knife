"use client";

import React from "react";
import type { ServerConfig, ToolRule } from "@/lib/types";
import DataTable, { type Column } from "@/components/DataTable";
import { Plus, Trash2 } from "lucide-react";

interface ToolRulesSectionProps {
  config: ServerConfig;
  onUpdateTool: (ruleId: string, access: "none" | "active") => void;
  onDeleteTool: (ruleId: string) => void;
  onOpenAddToolModal: () => void;
}

export function ToolRulesSection({
  config,
  onUpdateTool,
  onDeleteTool,
  onOpenAddToolModal,
}: ToolRulesSectionProps) {
  const toolColumns: Column<ToolRule>[] = [
    {
      key: "pattern",
      header: "Pattern",
      render: (r) => <span className="font-mono text-xs">{r.pattern}</span>,
    },
    {
      key: "access",
      header: "Access",
      headerClassName: "w-[120px]",
      render: (r) => (
        <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
          {(["none", "active"] as const).map((a) => (
            <button
              key={a}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateTool(r.id, a);
              }}
              className={`px-3 py-0.5 text-xs font-medium ${
                r.access === a
                  ? a === "active"
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-400"
                  : "bg-gray-800 text-gray-500 hover:bg-gray-700"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
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
          onClick={() => onDeleteTool(r.id)}
          className="text-gray-600 hover:text-red-400"
          title="Delete tool rule"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Tool Permissions</h2>
        <button
          onClick={onOpenAddToolModal}
          className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 font-medium"
        >
          <Plus size={16} /> Add Tool
        </button>
      </div>
      <DataTable
        columns={toolColumns}
        data={config?.permissions?.tools || []}
        rowKey={(r) => r.id}
        emptyMessage="No tool rules. Default: deny all."
      />
    </section>
  );
}
