"use client";

import React from "react";
import type { CommandAccess, CommandRule, ServerConfig } from "@/lib/types";
import DataTable, { type Column } from "@/components/DataTable";
import { CommandToggles } from "@/components/AccessToggles";
import { Plus, Trash2 } from "lucide-react";

interface CommandRulesSectionProps {
  config: ServerConfig;
  onToggleCommand: (ruleId: string, access: CommandAccess) => void;
  onDeleteCommand: (ruleId: string) => void;
  onOpenAddCommandModal: () => void;
}

export function CommandRulesSection({
  config,
  onToggleCommand,
  onDeleteCommand,
  onOpenAddCommandModal,
}: CommandRulesSectionProps) {
  const commandColumns: Column<CommandRule>[] = [
    {
      key: "pattern",
      header: "Pattern",
      headerClassName: "w-[40%]",
      cellClassName: "font-mono text-xs truncate",
      render: (r) => r.pattern,
    },
    {
      key: "access",
      header: "Access",
      headerClassName: "w-[130px]",
      render: (r) => (
        <CommandToggles value={r.access} onChange={(a) => onToggleCommand(r.id, a)} />
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
          onClick={() => onDeleteCommand(r.id)}
          className="text-gray-600 hover:text-red-400"
          title="Delete command rule"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Command Permissions</h2>
        <button
          onClick={onOpenAddCommandModal}
          className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 font-medium"
        >
          <Plus size={16} /> Add Command
        </button>
      </div>
      <DataTable
        columns={commandColumns}
        data={config.permissions?.commands || []}
        rowKey={(r) => r.id}
        emptyMessage="No command rules."
      />
    </section>
  );
}
