/** Typed API client for fetching config data from the Web UI backend routes. */

import type { AccessLevel, CommandAccess, AuditEntry, PathRule, ServerConfig, ServerName } from "./types";

const BASE = "/api";

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
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Config ──────────────────────────────────────────

export async function getConfig(server: ServerName): Promise<ServerConfig> {
  return fetchJSON<ServerConfig>(`${BASE}/config/${server}`);
}

export async function updateConfig(server: ServerName, config: ServerConfig): Promise<{ saved: boolean }> {
  return fetchJSON(`${BASE}/config/${server}`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

// ── Path Rules ─────────────────────────────────────

export async function addPathRule(server: ServerName, rule: Omit<PathRule, "id">): Promise<{ created: boolean; rule: PathRule }> {
  return fetchJSON(`${BASE}/config/${server}/paths`, {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updatePathRule(server: ServerName, ruleId: string, access: AccessLevel): Promise<{ updated: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/paths/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify({ access }),
  });
}

export async function deletePathRule(server: ServerName, ruleId: string): Promise<{ deleted: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/paths/${ruleId}`, {
    method: "DELETE",
  });
}

// ── Command Rules ──────────────────────────────────

export async function addCommandRule(server: ServerName, rule: { pattern: string; access: CommandAccess; description?: string }): Promise<{ created: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/commands`, {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updateCommandRule(server: ServerName, ruleId: string, access: CommandAccess): Promise<{ updated: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/commands/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify({ access }),
  });
}

export async function deleteCommandRule(server: ServerName, ruleId: string): Promise<{ deleted: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/commands/${ruleId}`, {
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
  type: "paths" | "commands" = "paths"
): Promise<{ updated: number; access: string; type: string }> {
  return fetchJSON(`${BASE}/config/${server}/bulk`, {
    method: "PATCH",
    body: JSON.stringify({ access, type }),
  });
}

export async function bulkUpdatePathRules(
  server: ServerName,
  updates: Array<{ id: string; access: AccessLevel }>
): Promise<{ updated: number }> {
  return fetchJSON(`${BASE}/config/${server}/bulk`, {
    method: "PATCH",
    body: JSON.stringify({ type: "paths", updates }),
  });
}

/** Atomically update a path rule AND cascade restrictions to children.
 *  Single YAML read+write on the server — replaces 5 sequential calls. */
export async function cascadePathAccess(
  server: ServerName,
  ruleId: string,
  access: AccessLevel
): Promise<{ updated: number; changes: Array<{ id: string; access: string }> }> {
  return fetchJSON(`${BASE}/config/${server}/cascade`, {
    method: "PATCH",
    body: JSON.stringify({ ruleId, access }),
  });
}

// ── Scan ────────────────────────────────────────────

export async function scanServer(server: ServerName): Promise<{ scanned: boolean; discovered: number; added: number; total: number; message?: string }> {
  return fetchJSON(`${BASE}/scan/${server}`, { method: "POST" });
}

// ── Settings ────────────────────────────────────────

export interface AppSettings {
  scan: {
    intervalMinutes: number;
    excludePatterns: string[];
  };
  auditPageSize?: number;
  providerKeys?: {
    anthropicAdminKey?: string;
    deepseekKey?: string;
    openrouterKey?: string;
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

export async function getFolders(server: ServerName): Promise<{ server: string; folders: FolderNode[]; count: number }> {
  return fetchJSON(`${BASE}/folders/${server}`);
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

// ── Tool Rules (proxy servers) ──────────────────────

export async function addToolRule(
  server: string,
  rule: { pattern: string; access: "none" | "active"; description?: string }
) {
  return fetchJSON<{ created: boolean; rule: { id: string } }>(
    `${BASE}/config/${server}/tools`,
    { method: "POST", body: JSON.stringify(rule) }
  );
}

export async function updateToolRule(
  server: string,
  ruleId: string,
  access: "none" | "active"
) {
  return fetchJSON<{ updated: boolean }>(
    `${BASE}/config/${server}/tools/${ruleId}`,
    { method: "PATCH", body: JSON.stringify({ access }) }
  );
}

export async function deleteToolRule(server: string, ruleId: string) {
  return fetchJSON<{ deleted: boolean }>(
    `${BASE}/config/${server}/tools/${ruleId}`,
    { method: "DELETE" }
  );
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

export async function updateAgentsSettings(data: { mode: string }) {
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

// ── Stats ──────────────────────────────────────────

export interface StatsResponse {
  totals: { all_time: number; today: number; this_week: number };
  by_server: Record<string, number>;
  by_tool: Array<{ name: string; count: number }>;
  by_day: Array<{ date: string; count: number }>;
  result_ratio: { allowed: number; denied: number };
  by_user?: Array<{ user_id: string; count: number }>;
  top_denied?: Array<{ target: string; count: number }>;
}

export interface ProviderModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  currency: string;
  requests: number;
}

export interface ProviderStatsEntry {
  provider: string;
  label: string;
  status: "ok" | "error" | "unconfigured";
  error?: string;
  tokens: { input: number; output: number; total: number };
  cost: { total: number; currency: string };
  requests: number;
  models: ProviderModelStats[];
  period: { start: string; end: string };
  raw?: Record<string, unknown>;
}

export interface AllStatsResponse {
  audit: StatsResponse;
  providers: ProviderStatsEntry[];
  combined: {
    totalCost: number;
    currency: string;
    totalTokens: number;
    totalRequests: number;
  };
}

export async function getStats(): Promise<StatsResponse> {
  return fetchJSON<StatsResponse>(`${BASE}/stats`);
}

export async function getAllStats(): Promise<AllStatsResponse> {
  return fetchJSON<AllStatsResponse>(`${BASE}/stats?providers=true`);
}
