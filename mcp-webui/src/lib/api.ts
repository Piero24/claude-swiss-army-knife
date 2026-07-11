/** Typed API client for fetching config data from the Web UI backend routes. */

import type { AccessLevel, AuditEntry, PathRule, ServerConfig, ServerName } from "./types";

const BASE = "/api";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
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

export async function addCommandRule(server: ServerName, rule: { pattern: string; access: AccessLevel; description?: string }): Promise<{ created: boolean }> {
  return fetchJSON(`${BASE}/config/${server}/commands`, {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updateCommandRule(server: ServerName, ruleId: string, access: AccessLevel): Promise<{ updated: boolean }> {
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

export async function getAuditLog(server: ServerName, limit = 50, filter?: "allowed" | "denied"): Promise<AuditEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filter) params.set("filter", filter);
  return fetchJSON<AuditEntry[]>(`${BASE}/audit/${server}?${params}`);
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
