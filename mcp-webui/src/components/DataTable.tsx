"use client";

import type { ReactNode } from "react";

export interface Column<T> {
  /** Unique key for the column */
  key: string;
  /** Header label */
  header: string;
  /** Header class overrides (e.g., width) */
  headerClassName?: string;
  /** Cell class overrides */
  cellClassName?: string;
  /** Render function for the cell content */
  render: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  /** Column definitions */
  columns: Column<T>[];
  /** Data rows */
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T, index: number) => string;
  /** Message shown when data is empty */
  emptyMessage?: string;
}

/**
 * Simple reusable data table — consistent rounded border, dark header, hover rows.
 * Replaces the 4 duplicated table structures across server detail, agents, etc.
 *
 * Note: The audit log uses a more complex fixed-header + scrollable-body pattern
 * and remains a specialized inline implementation.
 */
export default function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = "No data",
}: DataTableProps<T>) {
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2 ${col.headerClassName || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-t border-gray-800 hover:bg-gray-900/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2 align-middle ${col.cellClassName || ""}`}
                >
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-4 text-gray-500 text-center"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
