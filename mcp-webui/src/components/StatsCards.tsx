"use client";

import { useEffect, useState } from "react";
import { getStats, type StatsResponse } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444"];

export default function StatsCards() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(false);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 p-4 animate-pulse">
            <div className="h-3 w-20 bg-gray-800 rounded mb-2" />
            <div className="h-7 w-16 bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ──
  if (!stats || stats.totals.all_time === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 mb-8 text-center">
        <p className="text-sm text-gray-400">No data yet — connect an MCP server to start tracking</p>
      </div>
    );
  }

  // Most used server
  const topServer = Object.entries(stats.by_server).sort((a, b) => b[1] - a[1])[0];

  // Pie data
  const pieData = Object.entries(stats.by_server).map(([name, count]) => ({ name, value: count }));

  return (
    <>
      {/* ── Stats cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <StatCard label="Total requests" value={stats.totals.all_time.toLocaleString()} />
        <StatCard
          label="Today"
          value={stats.totals.today.toLocaleString()}
          sub={`${stats.totals.this_week.toLocaleString()} this week`}
        />
        <StatCard
          label="Most used"
          value={topServer ? topServer[0] : "—"}
          sub={topServer ? `${topServer[1].toLocaleString()} requests` : undefined}
        />
      </div>

      {/* ── Charts toggle ── */}
      <button
        onClick={() => setChartsOpen(!chartsOpen)}
        className="flex items-center gap-1.5 mb-3 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        {chartsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {chartsOpen ? "Hide charts" : "Show charts"}
      </button>

      {/* ── Charts section ── */}
      {chartsOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Requests per day */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Requests per day</h3>
            {stats.by_day.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.by_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px", fontSize: "12px" }}
                    labelStyle={{ color: "#d1d5db" }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-500">No daily data yet</p>
            )}
          </div>

          {/* Per-server breakdown */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Per-server breakdown</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    strokeWidth={0}
                    labelLine={false}
                    label={({ name, percent }: any) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px", fontSize: "12px" }}
                    labelStyle={{ color: "#d1d5db" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-500">No server data yet</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
