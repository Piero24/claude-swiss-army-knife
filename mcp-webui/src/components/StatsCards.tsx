"use client";

import { useEffect, useState, useCallback } from "react";
import { getStats, getAllStats, type StatsResponse, type AllStatsResponse, type ProviderStatsEntry } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, RefreshCw, ExternalLink } from "lucide-react";

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444"];

export default function StatsCards() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [allStats, setAllStats] = useState<AllStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);

  // Load basic audit stats on mount
  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const data = await getAllStats();
      setAllStats(data);
      setProvidersOpen(true);
    } catch {
      // provider fetch may fail if external APIs are unreachable
    } finally {
      setLoadingProviders(false);
    }
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
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
        <StatCard
          label="Allowed / Denied"
          value={`${stats.result_ratio.allowed} / ${stats.result_ratio.denied}`}
          sub={
            stats.result_ratio.allowed + stats.result_ratio.denied > 0
              ? `${((stats.result_ratio.allowed / (stats.result_ratio.allowed + stats.result_ratio.denied)) * 100).toFixed(1)}% allowed`
              : undefined
          }
        />
      </div>

      {/* ── Charts toggle ── */}
      <button
        onClick={() => setChartsOpen(!chartsOpen)}
        className="flex items-center gap-1.5 mb-3 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        {chartsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {chartsOpen ? "Hide MCP charts" : "Show MCP charts"}
      </button>

      {/* ── MCP charts section ── */}
      {chartsOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                    label={(props: { name?: string; percent?: number }) =>
                      `${props.name || ""} ${((props.percent || 0) * 100).toFixed(0)}%`
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

          {/* Top tools */}
          {stats.by_tool.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Top tools</h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {stats.by_tool.slice(0, 8).map((t) => (
                  <div key={t.name} className="flex justify-between text-xs">
                    <span className="text-gray-400 truncate max-w-[70%]" title={t.name}>{t.name}</span>
                    <span className="text-gray-300 font-mono">{t.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Denied targets */}
          {stats.top_denied && stats.top_denied.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Top denied targets</h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {stats.top_denied.slice(0, 8).map((d) => (
                  <div key={d.target} className="flex justify-between text-xs">
                    <span className="text-red-400 truncate max-w-[70%]" title={d.target}>{d.target}</span>
                    <span className="text-red-300 font-mono">{d.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Provider stats section ── */}
      <div className="mb-8">
        {!allStats ? (
          <button
            onClick={loadProviders}
            disabled={loadingProviders}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-50"
          >
            {loadingProviders ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Fetching provider data…
              </>
            ) : (
              <>
                <ExternalLink size={14} />
                Load AI provider stats (tokens & cost)
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={() => setProvidersOpen(!providersOpen)}
              className="flex items-center gap-1.5 mb-3 text-xs text-gray-400 hover:text-gray-300 transition-colors"
            >
              {providersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {providersOpen ? "Hide provider stats" : "Show provider stats"}
              {allStats.combined.totalCost > 0 && (
                <span className="text-green-400 ml-2">
                  ${allStats.combined.totalCost.toFixed(2)} {allStats.combined.currency}
                </span>
              )}
            </button>

            {providersOpen && (
              <div className="space-y-4">
                {/* Combined summary row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard
                    label="Total cost"
                    value={`$${allStats.combined.totalCost.toFixed(2)}`}
                    sub={allStats.combined.currency}
                  />
                  <StatCard
                    label="Total tokens"
                    value={formatTokens(allStats.combined.totalTokens)}
                    sub={`${allStats.combined.totalRequests.toLocaleString()} API requests`}
                  />
                  <StatCard
                    label="MCP requests"
                    value={allStats.audit.totals.all_time.toLocaleString()}
                    sub={`${allStats.audit.totals.today.toLocaleString()} today`}
                  />
                </div>

                {/* Per-provider details */}
                {allStats.providers.map((provider) => (
                  <ProviderCard key={provider.provider} provider={provider} />
                ))}

                {/* Refresh button */}
                <button
                  onClick={loadProviders}
                  disabled={loadingProviders}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <RefreshCw size={12} className={loadingProviders ? "animate-spin" : ""} />
                  Refresh provider data
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ProviderCard({ provider }: { provider: ProviderStatsEntry }) {
  const statusColor: Record<string, string> = {
    ok: "text-green-400",
    error: "text-red-400",
    unconfigured: "text-gray-500",
  };

  if (provider.status === "unconfigured") {
    return (
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/50 p-4 opacity-60">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-500">{provider.label}</h4>
          <span className="text-xs text-gray-600">Not configured</span>
        </div>
        {provider.provider === "gemini" && (
          <p className="text-xs text-gray-600 mt-2">
            Google Gemini does not expose a usage REST API. Use{" "}
            <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener" className="text-blue-500 underline">Google Cloud Console → Billing Reports</a>
          </p>
        )}
        {provider.provider !== "gemini" && (
          <p className="text-xs text-gray-600 mt-2">
            Add your {provider.label} API key in Settings to enable cost tracking.
          </p>
        )}
      </div>
    );
  }

  if (provider.status === "error") {
    return (
      <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-300">{provider.label}</h4>
          <span className="text-xs text-red-400">Error</span>
        </div>
        <p className="text-xs text-red-400/70 mt-1">{provider.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-200">{provider.label}</h4>
        <span className={statusColor.ok + " text-xs"}>Connected</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <MiniStat label="Tokens" value={formatTokens(provider.tokens.total)} />
        <MiniStat label="Input" value={formatTokens(provider.tokens.input)} />
        <MiniStat label="Output" value={formatTokens(provider.tokens.output)} />
        <MiniStat
          label="Cost"
          value={`$${provider.cost.total.toFixed(2)}`}
          sub={provider.cost.currency}
        />
      </div>

      {/* Model breakdown */}
      {provider.models.length > 0 && (
        <div className="mt-2">
          <h5 className="text-xs font-medium text-gray-500 mb-1.5">By model</h5>
          <div className="space-y-1">
            {provider.models.slice(0, 5).map((m) => (
              <div key={m.model} className="flex items-center justify-between text-xs">
                <span className="text-gray-400 truncate max-w-[50%]" title={m.model}>
                  {m.model}
                </span>
                <span className="text-gray-500 font-mono text-[11px]">
                  {formatTokens(m.totalTokens)}
                </span>
                <span className="text-gray-400 font-mono text-[11px] w-16 text-right">
                  ${m.cost.toFixed(2)}
                </span>
              </div>
            ))}
            {provider.models.length > 5 && (
              <p className="text-xs text-gray-600 mt-1">
                +{provider.models.length - 5} more models
              </p>
            )}
          </div>
        </div>
      )}

      {/* Period */}
      {provider.period.start && (
        <p className="text-[10px] text-gray-600 mt-2">
          {provider.period.start.slice(0, 10)} → {provider.period.end.slice(0, 10)}
        </p>
      )}
    </div>
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

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-200">{value}</p>
      {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
