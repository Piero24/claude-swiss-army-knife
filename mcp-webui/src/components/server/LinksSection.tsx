"use client";

import React, { useState } from "react";
import type { LinkItem, ServerConfig } from "@/lib/types";
import DataTable, { type Column } from "@/components/DataTable";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

interface LinksSectionProps {
  config: ServerConfig;
  onDeleteLink: (linkNameOrUrl: string) => void;
  onOpenAddLinkModal: () => void;
}

export function LinksSection({
  config,
  onDeleteLink,
  onOpenAddLinkModal,
}: LinksSectionProps) {
  const [linkSearch, setLinkSearch] = useState("");

  const linkColumns: Column<LinkItem>[] = [
    {
      key: "name",
      header: "Name",
      headerClassName: "w-[25%]",
      cellClassName: "font-semibold text-xs text-white",
      render: (r: LinkItem) => r.name,
    },
    {
      key: "url",
      header: "URL",
      headerClassName: "w-[30%]",
      render: (r: LinkItem) => (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs flex items-center gap-1 truncate max-w-[280px]"
        >
          {r.url} <ExternalLink size={12} className="shrink-0" />
        </a>
      ),
    },
    {
      key: "category",
      header: "Category",
      headerClassName: "w-[15%]",
      render: (r: LinkItem) =>
        r.category ? (
          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-gray-300 border border-gray-700">
            {r.category}
          </span>
        ) : null,
    },
    {
      key: "tags",
      header: "Tags",
      headerClassName: "hidden md:table-cell w-[15%]",
      cellClassName: "hidden md:table-cell",
      render: (r: LinkItem) => (
        <div className="flex flex-wrap gap-1">
          {(r.tags || []).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800"
            >
              #{tag}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      headerClassName: "hidden lg:table-cell",
      cellClassName: "text-gray-400 text-xs hidden lg:table-cell truncate",
      render: (r: LinkItem) => r.description || "",
    },
    {
      key: "delete",
      header: "",
      headerClassName: "w-10",
      cellClassName: "text-center",
      render: (r: LinkItem) => (
        <button
          onClick={() => onDeleteLink(r.name)}
          className="text-gray-600 hover:text-red-400"
          title="Delete link"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  const visibleLinks = (config?.links || []).filter((l) => {
    if (!linkSearch) return true;
    const q = linkSearch.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      l.url.toLowerCase().includes(q) ||
      (l.category && l.category.toLowerCase().includes(q)) ||
      (l.description && l.description.toLowerCase().includes(q)) ||
      (l.tags && l.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Managed Links ({(config?.links || []).length})</h2>
        <button
          onClick={onOpenAddLinkModal}
          className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 font-medium"
        >
          <Plus size={16} /> Add Link
        </button>
      </div>
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search links by name, URL, category, or tag…"
          value={linkSearch}
          onChange={(e) => setLinkSearch(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-200"
        />
      </div>
      <DataTable
        columns={linkColumns}
        data={visibleLinks}
        rowKey={(r: LinkItem) => r.url || r.name}
        emptyMessage="No links available. Click '+ Add Link' above to add one."
      />
    </section>
  );
}
