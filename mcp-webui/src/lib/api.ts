/** Typed API client for fetching config data from the Web UI backend routes. */

import type { AccessLevel, CommandAccess, AuditEntry, PathRule, ServerConfig, ServerName } from "./types";

const BASE = "/api";

function withUser(url: string, userId?: string | null): string {
  if (!userId) return url;
  return url + (url.includes("?") ? "&" : "?") + `user=${encodeURIComponent(userId)}`;
}


async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`[api] ${res.status} on ${url}: ${body.slice(0, 500)}`);
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Config ──────────────────────────────────────────

export async function getConfig(server: ServerName, userId?: string | null): Promise<ServerConfig> {
  return fetchJSON<ServerConfig>(withUser(`${BASE}/config/${server}`, userId));
}

export async function updateConfig(server: ServerName, config: ServerConfig, userId?: string | null): Promise<{ saved: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}`, userId), {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

// ── Path Rules ─────────────────────────────────────

export async function addPathRule(server: ServerName, rule: Omit<PathRule, "id">, userId?: string | null): Promise<{ created: boolean; rule: PathRule }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/paths`, userId), {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updatePathRule(server: ServerName, ruleId: string, access: AccessLevel, userId?: string | null): Promise<{ updated: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/paths/${ruleId}`, userId), {
    method: "PATCH",
    body: JSON.stringify({ access }),
  });
}

export async function deletePathRule(server: ServerName, ruleId: string, userId?: string | null): Promise<{ deleted: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/paths/${ruleId}`, userId), {
    method: "DELETE",
  });
}

// ── Command Rules ──────────────────────────────────

export async function addCommandRule(server: ServerName, rule: { pattern: string; access: CommandAccess; description?: string }, userId?: string | null): Promise<{ created: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/commands`, userId), {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updateCommandRule(server: ServerName, ruleId: string, access: CommandAccess, userId?: string | null): Promise<{ updated: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/commands/${ruleId}`, userId), {
    method: "PATCH",
    body: JSON.stringify({ access }),
  });
}

export async function deleteCommandRule(server: ServerName, ruleId: string, userId?: string | null): Promise<{ deleted: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/commands/${ruleId}`, userId), {
    method: "DELETE",
  });
}

// ── Audit ──────────────────────────────────────────

export async function getAuditLog(
  server: ServerName,
  limit = 50,
  offset = 0
): Promise<{ entries: AuditEntry[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return fetchJSON<{ entries: AuditEntry[]; total: number }>(`${BASE}/audit/${server}?${params}`);
}

// ── Bulk ────────────────────────────────────────────

export async function bulkSetAccess(
  server: ServerName,
  access: AccessLevel,
  type: "paths" | "commands" = "paths",
  userId?: string | null
): Promise<{ updated: number; access: string; type: string }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/bulk`, userId), {
    method: "PATCH",
    body: JSON.stringify({ access, type }),
  });
}

export async function bulkUpdatePathRules(
  server: ServerName,
  updates: Array<{ id: string; access: AccessLevel }>,
  userId?: string | null
): Promise<{ updated: number }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/bulk`, userId), {
    method: "PATCH",
    body: JSON.stringify({ type: "paths", updates }),
  });
}

/** Atomically update a path rule AND cascade restrictions to children.
 *  Single YAML read+write on the server — replaces 5 sequential calls. */
export async function cascadePathAccess(
  server: ServerName,
  ruleId: string,
  access: AccessLevel,
  userId?: string | null
): Promise<{ updated: number; changes: Array<{ id: string; access: string }> }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/cascade`, userId), {
    method: "PATCH",
    body: JSON.stringify({ ruleId, access }),
  });
}

// ── Scan ────────────────────────────────────────────

export async function scanServer(server: ServerName, userId?: string | null): Promise<{ scanned: boolean; discovered: number; added: number; total: number; message?: string }> {
  return fetchJSON(withUser(`${BASE}/scan/${server}`, userId), { method: "POST" });
}

// ── Settings ────────────────────────────────────────

export interface AppSettings {
  scan: {
    intervalMinutes: number;
    timeoutSeconds?: number;
    excludePatterns: string[];
  };
  auditPageSize?: number;
  logRetentionMonths?: number;
  synology?: {
    maxDownloadMb: number;
    defaultSearchPath: string;
  };
}

export async function getSettings(): Promise<AppSettings> {
  return fetchJSON(`${BASE}/settings`);
}

export async function updateSettings(settings: AppSettings): Promise<{ saved: boolean }> {
  return fetchJSON(`${BASE}/settings`, {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ── Folders ─────────────────────────────────────────

export interface FolderNode {
  name: string;
  path: string;
  access: string;
  description: string;
  children: FolderNode[];
}

export async function getFolders(server: ServerName, userId?: string | null): Promise<{ server: string; folders: FolderNode[]; count: number }> {
  return fetchJSON(withUser(`${BASE}/folders/${server}`, userId));
}

// ── Health ──────────────────────────────────────────

export interface HealthStatus {
  status: "healthy" | "idle" | "unconfigured" | "stopped" | "not-found" | "error";
  container: string;
  lastActivity: string | null;
  detail: string;
}

export async function getHealth(server: ServerName): Promise<HealthStatus> {
  return fetchJSON<HealthStatus>(`${BASE}/health/${server}`);
}

// ── Server Status ──────────────────────────────────

export interface ServerStatus {
  enabled: boolean;
}

export interface ServersStatus {
  servers: Record<string, ServerStatus>;
}

export async function getServersStatus(): Promise<ServersStatus> {
  return fetchJSON<ServersStatus>(`${BASE}/settings`).then((s) => {
    // Extract servers section from settings
    const settings = s as unknown as Record<string, unknown>;
    if (settings.servers && typeof settings.servers === "object") {
      return { servers: settings.servers as Record<string, ServerStatus> };
    }
    return { servers: {} };
  });
}

export async function toggleServerStatus(server: string, enabled: boolean): Promise<{ server: string; enabled: boolean }> {
  return fetchJSON(`${BASE}/servers/${server}/status`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function bulkToggleServers(enabled: boolean): Promise<{ enabled: boolean; servers: string[] }> {
  return fetchJSON(`${BASE}/servers/bulk-status`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

// ── Tool Rules (proxy servers) ──────────────────────

export async function addToolRule(
  server: string,
  rule: { pattern: string; access: "none" | "active"; description?: string },
  userId?: string | null
) {
  return fetchJSON<{ created: boolean; rule: { id: string } }>(
    withUser(`${BASE}/config/${server}/tools`, userId),
    { method: "POST", body: JSON.stringify(rule) }
  );
}

export async function updateToolRule(
  server: string,
  ruleId: string,
  access: "none" | "active",
  userId?: string | null
) {
  return fetchJSON<{ updated: boolean }>(
    withUser(`${BASE}/config/${server}/tools/${ruleId}`, userId),
    { method: "PATCH", body: JSON.stringify({ access }) }
  );
}

export async function deleteToolRule(server: string, ruleId: string, userId?: string | null) {
  return fetchJSON<{ deleted: boolean }>(
    withUser(`${BASE}/config/${server}/tools/${ruleId}`, userId),
    { method: "DELETE" }
  );
}

// ── Stats (audit-log only) ──────────────────────────

export interface StatsResponse {
  totals: { all_time: number; today: number; this_week: number };
  by_server: Record<string, number>;
  by_tool: Array<{ name: string; count: number }>;
  by_day: Array<{ date: string; count: number }>;
  result_ratio: { allowed: number; denied: number };
  by_user?: Array<{ user_id: string; count: number }>;
  top_denied?: Array<{ target: string; count: number }>;
}

export async function getStats(): Promise<StatsResponse> {
  return fetchJSON<StatsResponse>(`${BASE}/stats`);
}

// ── Auth ───────────────────────────────────────────

export async function login(apiKey: string): Promise<{ success: boolean }> {
  return fetchJSON(`${BASE}/auth`, {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });
}

export async function logout(): Promise<{ success: boolean }> {
  return fetchJSON(`${BASE}/auth`, { method: "DELETE" });
}

// ── Agents ──────────────────────────────────────────

export async function getAgents() {
  return fetchJSON<import("./types").UsersConfig>(`${BASE}/agents`);
}

export async function updateAgentsSettings(data: { users: Array<{ id: string; key: string; name: string; enabled: boolean; tools: string[] }> }) {
  return fetchJSON<{ saved: boolean }>(`${BASE}/agents`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function updateAgent(
  id: string,
  data: { enabled?: boolean; tools?: string[] }
) {
  return fetchJSON<{ updated: boolean }>(`${BASE}/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Prompt ────────────────────────────────────────────

export async function getPrompt(
  server: string,
  userId: string
): Promise<{ prompt: string }> {
  return fetchJSON(`${BASE}/config/${server}/prompt?user=${encodeURIComponent(userId)}`);
}

export async function updatePrompt(
  server: string,
  userId: string,
  prompt: string
): Promise<{ saved: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/prompt?user=${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ prompt }),
  });
}

// ── Links ───────────────────────────────────────────

export async function addLink(
  server: ServerName,
  link: { name: string; url: string; description?: string; category?: string; tags?: string[] },
  userId?: string | null
): Promise<{ created: boolean; link: import("./types").LinkItem }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/links`, userId), {
    method: "POST",
    body: JSON.stringify(link),
  });
}

export async function deleteLink(
  server: ServerName,
  linkNameOrUrl: string,
  userId?: string | null
): Promise<{ deleted: boolean }> {
  return fetchJSON(withUser(`${BASE}/config/${server}/links/${encodeURIComponent(linkNameOrUrl)}`, userId), {
    method: "DELETE",
  });
}