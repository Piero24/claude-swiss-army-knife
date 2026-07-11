"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServerConfig, ServerName } from "@/lib/types";
import { SERVER_ICONS, SERVER_LABELS } from "@/lib/types";
import { getConfig } from "@/lib/api";
import { logout } from "@/lib/api";
import { LogOut } from "lucide-react";

const SERVERS: ServerName[] = ["ubuntu-server", "obsidian", "synology-nas"];

export default function DashboardPage() {
  const [configs, setConfigs] = useState<Partial<Record<ServerName, ServerConfig>>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const results: Partial<Record<ServerName, ServerConfig>> = {};
      for (const s of SERVERS) {
        try {
          results[s] = await getConfig(s);
        } catch {
          // server unavailable — skip
        }
      }
      setConfigs(results);
      setLoading(false);
    }
    load();
  }, []);

  async function handleLogout() {
    try {
      await logout();
      router.push("/login");
    } catch {
      router.push("/login");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">🔐 MCP Permissions Manager</h1>
        <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <LogOut size={16} /> Logout
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {SERVERS.map((server) => {
          const config = configs[server];
          return (
            <Link
              key={server}
              href={`/${server}`}
              className="block rounded-lg border border-gray-800 bg-gray-900 p-5 hover:border-gray-600 transition-colors"
            >
              <div className="text-3xl mb-2">{SERVER_ICONS[server]}</div>
              <h2 className="font-semibold mb-1">{SERVER_LABELS[server]}</h2>
              {config ? (
                <div className="text-xs text-gray-400 space-y-0.5">
                  <p>{config.permissions.paths.length} path rules</p>
                  <p>{config.permissions.commands.length} command rules</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-green-900/50 text-green-400 text-xs">
                    ✅ Connected
                  </span>
                </div>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded bg-red-900/50 text-red-400 text-xs">
                  ❌ Unavailable
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
