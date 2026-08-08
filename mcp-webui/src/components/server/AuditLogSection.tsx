"use client";

import React, { useState } from "react";
import type { AccessLevel, AuditEntry } from "@/lib/types";
import Badge from "@/components/Badge";

interface AuditLogSectionProps {
  auditLog: AuditEntry[];
  auditTotal: number;
  auditPage: number;
  auditPageSize: number;
  auditLoading: boolean;
  onLoadAuditPage: (page: number) => void;
}

export function AuditLogSection({
  auditLog,
  auditTotal,
  auditPage,
  auditPageSize,
  auditLoading,
  onLoadAuditPage,
}: AuditLogSectionProps) {
  const [logSearch, setLogSearch] = useState("");
  const [logAccessFilter, setLogAccessFilter] = useState<AccessLevel | "all">("all");
  const [logResultFilter, setLogResultFilter] = useState<"all" | "allowed" | "denied">("all");
  const [logDateFilter, setLogDateFilter] = useState<"all" | "hour" | "today" | "week">("all");
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const now = Date.now();
  const dateThresholds: Record<string, number> = {
    hour: now - 60 * 60 * 1000,
    today: new Date(new Date().toDateString()).getTime(),
    week: now - 7 * 24 * 60 * 60 * 1000,
  };

  const visibleAuditLog = auditLog.filter((e) => {
    if (logAccessFilter !== "all" && e.access !== logAccessFilter) return false;
    if (logResultFilter !== "all" && e.result !== logResultFilter) return false;
    if (logDateFilter !== "all") {
      if (!e.ts) return false;
      const ts = new Date(e.ts).getTime();
      if (isNaN(ts) || ts < dateThresholds[logDateFilter]) return false;
    }
    if (logSearch) {
      const q = logSearch.toLowerCase();
      return (
        (e.target || "").toLowerCase().includes(q) ||
        (e.command || "").toLowerCase().includes(q) ||
        (e.result || "").toLowerCase().includes(q) ||
        (e.reason || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const logFiltersActive =
    logAccessFilter !== "all" || logResultFilter !== "all" || logDateFilter !== "all";
  const totalAuditPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Audit Log</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          type="text"
          placeholder="Filter log…"
          value={logSearch}
          onChange={(e) => setLogSearch(e.target.value)}
          className="flex-1 min-w-[140px] rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-200"
        />
        <select
          value={logAccessFilter}
          onChange={(e) => setLogAccessFilter(e.target.value as AccessLevel | "all")}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All access</option>
          <option value="read">Read</option>
          <option value="write">Write</option>
          <option value="none">None</option>
        </select>
        <select
          value={logResultFilter}
          onChange={(e) => setLogResultFilter(e.target.value as "all" | "allowed" | "denied")}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All results</option>
          <option value="allowed">Allowed</option>
          <option value="denied">Denied</option>
        </select>
        <select
          value={logDateFilter}
          onChange={(e) => setLogDateFilter(e.target.value as "all" | "hour" | "today" | "week")}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All time</option>
          <option value="hour">Last hour</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
        </select>
        {logFiltersActive && (
          <button
            onClick={() => {
              setLogAccessFilter("all");
              setLogResultFilter("all");
              setLogDateFilter("all");
            }}
            className="px-2 py-1.5 text-xs rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="rounded-lg border border-gray-800">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-left">
              <th className="px-2 py-2 w-14 rounded-tl-lg">Time</th>
              <th className="px-2 py-2 w-[13%]">Target</th>
              <th className="px-2 py-2 w-[62px]">Access</th>
              <th className="px-2 py-2 w-[62px]">Result</th>
              <th className="px-2 py-2 w-[35%] hidden md:table-cell">Reason</th>
              <th className="px-2 py-2 w-[80px] hidden md:table-cell">User</th>
              <th className="px-2 py-2 w-[90px] hidden md:table-cell">Sub-agent</th>
            </tr>
          </thead>
        </table>
        <div className="max-h-[60vh] overflow-y-auto border-t border-gray-800">
          <table className="w-full text-xs table-fixed">
            <tbody>
              {auditLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-gray-500 text-center">
                    Loading…
                  </td>
                </tr>
              )}
              {!auditLoading &&
                visibleAuditLog.map((entry, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setExpandedLogIdx(expandedLogIdx === i ? null : i)}
                  >
                    <td
                      className="px-2 py-1.5 text-gray-500 whitespace-nowrap w-14"
                      title={entry.ts || undefined}
                    >
                      {entry.ts?.slice(11, 19) || ""}
                    </td>
                    <td
                      className="px-2 py-1.5 font-mono truncate w-[13%]"
                      title={entry.target || entry.command || ""}
                    >
                      {entry.target || entry.command || entry.target_type || ""}
                    </td>
                    <td className="px-2 py-1.5 w-[62px]">
                      {entry.access ? (
                        <Badge variant="access" value={entry.access} />
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 w-[62px]">
                      <Badge variant="result" value={entry.result} />
                    </td>
                    <td
                      className="px-2 py-1.5 text-gray-600 truncate hidden md:table-cell w-[35%]"
                      title={entry.reason || undefined}
                    >
                      {entry.reason || ""}
                    </td>
                    <td
                      className="px-2 py-1.5 font-mono text-gray-500 truncate hidden md:table-cell w-[80px]"
                      title={entry.user_id || undefined}
                    >
                      {entry.user_id || "—"}
                    </td>
                    <td
                      className="px-2 py-1.5 font-mono text-gray-500 truncate hidden md:table-cell w-[90px]"
                      title={entry.subagent_id || undefined}
                    >
                      {entry.subagent_id || "—"}
                    </td>
                  </tr>
                ))}
              {!auditLoading && auditLog.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-gray-500 text-center">
                    No audit entries yet.
                  </td>
                </tr>
              )}
              {!auditLoading && auditLog.length > 0 && visibleAuditLog.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-gray-500 text-center">
                    No entries match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with pagination */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 bg-gray-900 text-xs text-gray-400 rounded-b-lg">
          <span>
            {auditTotal.toLocaleString()} entries (page {auditPage + 1} of {totalAuditPages})
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onLoadAuditPage(auditPage - 1)}
              disabled={auditPage <= 0 || auditLoading}
              className="px-2 py-0.5 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => onLoadAuditPage(auditPage + 1)}
              disabled={auditPage >= totalAuditPages - 1 || auditLoading}
              className="px-2 py-0.5 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expandedLogIdx !== null && visibleAuditLog[expandedLogIdx] && (
        <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900 p-4 text-xs space-y-2">
          {(() => {
            const e = visibleAuditLog[expandedLogIdx];
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500">Timestamp:</span>{" "}
                    <span className="text-gray-300">{e.ts || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Server:</span>{" "}
                    <span className="text-gray-300">{e.server || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Target type:</span>{" "}
                    <span className="text-gray-300">{e.target_type || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Target:</span>{" "}
                    <span className="text-gray-300 font-mono">{e.target || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Command:</span>{" "}
                    <span className="text-gray-300 font-mono">{e.command || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Access requested:</span>{" "}
                    <span
                      className={`font-medium ${
                        e.access === "write"
                          ? "text-green-400"
                          : e.access === "read"
                          ? "text-blue-400"
                          : e.access === "none"
                          ? "text-gray-400"
                          : "text-gray-300"
                      }`}
                    >
                      {e.access || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Result:</span>{" "}
                    <span
                      className={`font-medium ${
                        e.result === "allowed" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {e.result}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Reason:</span>{" "}
                    <span className="text-gray-300">{e.reason || "—"}</span>
                  </div>
                  {e.user_id && (
                    <div>
                      <span className="text-gray-500">User:</span>{" "}
                      <span className="text-gray-300 font-mono">{e.user_id}</span>
                    </div>
                  )}
                  {e.subagent_id && (
                    <div>
                      <span className="text-gray-500">Sub-agent:</span>{" "}
                      <span className="text-gray-400 font-mono text-xs">{e.subagent_id}</span>
                    </div>
                  )}
                </div>
                {e.message && (
                  <div>
                    <span className="text-gray-500">Message:</span>
                    <pre className="mt-1 p-2 rounded bg-gray-800 text-gray-300 whitespace-pre-wrap text-[11px] max-h-40 overflow-y-auto">
                      {e.message}
                    </pre>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
