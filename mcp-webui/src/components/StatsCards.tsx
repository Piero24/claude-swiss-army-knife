"use client";

import { useEffect, useMemo, useState } from "react";
import { getStats, type StatsResponse } from "@/lib/api";
import { serverLabel, SERVER_LABELS } from "@/lib/provider-stats/server-labels";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444"];
type Range = "week" | "month" | "year" | "all";

/** Merge the known server list into by_server so the pie always shows all servers. */
function mergeServerStats(byServer: Record<string, number>): Record<string, number> {
  const merged = { ...byServer };
  for (const key of Object.keys(SERVER_LABELS)) {
    if (!(key in merged)) merged[key] = 0;
  }
  return merged;
}

export default function StatsCards() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("all");

  useEffect(() => {
    function refresh() {
      getStats()
        .then(setStats)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    refresh();
    const interval = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(interval);
  }, []);

  const filteredDays = useMemo(() => {
    if (!stats?.by_day) return [];
    const now = new Date();
    const cutoffs: Record<Range, Date> = {
      week: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7),
      month: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
      year: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
      all: new Date(0),
    };
    const cutoff = cutoffs[range];
    return stats.by_day.filter((d) => new Date(d.date) >= cutoff);
  }, [stats, range]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 mb-8 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-32 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats || !stats.totals) return null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 mb-8">
      <h2 className="text-lg font-semibold mb-4">MCP Usage</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Requests" value={stats.totals.all_time.toLocaleString()} />
        <StatCard label="Today" value={stats.totals.today.toLocaleString()} />
        <StatCard label="Last 7 Days" value={stats.totals.this_week.toLocaleString()} />
        <StatCard
          label="Allowed / Denied"
          value={`${stats.result_ratio?.allowed || 0} / ${stats.result_ratio?.denied || 0}`}
        />
      </div>

      {/* Most used server */}
      {stats.by_server && Object.keys(stats.by_server).length > 0 && (
        <p className="text-xs text-gray-500 mb-4">
          Most used:{" "}
          {Object.entries(stats.by_server)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([name, count]) => (
              <span key={name} className="text-gray-400 ml-2">
                {serverLabel(name)} ({count})
              </span>
            ))}
        </p>
      )}

      {/* Charts */}
      <div className="space-y-6 mt-4">
        {/* Time range selector + requests per day */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-400">Requests per Day</h3>
            <div className="flex rounded overflow-hidden border border-gray-700">
              {(["week", "month", "year", "all"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                    range === r ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                  }`}
                >
                  {r === "all" ? "All" : r}
                </button>
              ))}
            </div>
          </div>
          {filteredDays.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={filteredDays}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-600 py-8 text-center">No data for this period</p>
          )}
        </div>

        {/* Per server pie + by user side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.by_server && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-2">By Server</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={Object.entries(mergeServerStats(stats.by_server)).map(([name, count]) => ({
                      name: serverLabel(name),
                      value: count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={false}
                  >
                    {Object.keys(mergeServerStats(stats.by_server)).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.by_user && stats.by_user.filter((u) => !(u.user_id === "anonymous" && stats.by_user!.length === 1)).length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-2">By User</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={stats.by_user.filter((u) => u.user_id !== "anonymous" || stats.by_user!.length > 1)}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <YAxis dataKey="user_name" type="category" tick={{ fontSize: 10, fill: "#9ca3af" }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-200">{value}</p>
    </div>
  );
}
