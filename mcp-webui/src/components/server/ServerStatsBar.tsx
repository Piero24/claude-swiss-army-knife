"use client";

import { useEffect, useState } from "react";

interface ServerStats {
  total: number;
  today: number;
  thisWeek: number;
  allowed: number;
  denied: number;
  topTools: Array<{ name: string; count: number }>;
  byUser: Array<{ user_id: string; count: number }>;
}

export function ServerStatsBar({ server }: { server: string }) {
  const [stats, setStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    fetch(`/api/stats?server=${encodeURIComponent(server)}`)
      .then((r) => r.json())
      .then((data) =>
        setStats({
          total: data.totals?.all_time || 0,
          today: data.totals?.today || 0,
          thisWeek: data.totals?.this_week || 0,
          allowed: data.result_ratio?.allowed || 0,
          denied: data.result_ratio?.denied || 0,
          topTools: (data.by_tool || []).slice(0, 5),
          byUser: (data.by_user || []).slice(0, 5),
        })
      )
      .catch(() => {});
  }, [server]);

  if (!stats || stats.total === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900/70 p-3">
      <div className="flex items-center gap-6 flex-wrap">
        <MiniStat label="Requests" value={stats.total.toLocaleString()} />
        <MiniStat label="Today" value={stats.today.toLocaleString()} />
        <MiniStat label="7 days" value={stats.thisWeek.toLocaleString()} />
        <MiniStat label="Allowed" value={stats.allowed.toLocaleString()} cls="text-green-400" />
        <MiniStat label="Denied" value={stats.denied.toLocaleString()} cls="text-red-400" />
        {stats.topTools.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Top tools:</span>
            {stats.topTools.slice(0, 3).map((t) => (
              <span key={t.name} className="text-gray-400 font-mono text-[11px]" title={t.name}>
                {t.name.length > 30 ? t.name.slice(0, 27) + "…" : t.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {stats.byUser.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-4 text-xs">
          <span className="text-gray-500">By user:</span>
          {stats.byUser.map((u) => (
            <span key={u.user_id} className="text-gray-400">
              <span className="text-gray-300 font-medium">{u.user_id}</span>
              <span className="text-gray-600 ml-1">({u.count})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ml-1.5 ${cls || "text-gray-200"}`}>{value}</span>
    </div>
  );
}
