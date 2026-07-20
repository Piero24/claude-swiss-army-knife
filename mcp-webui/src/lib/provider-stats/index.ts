/** Provider stats aggregator — fetches and combines stats from all
 *  configured providers plus the existing audit log stats. */

import type {
  ProviderStats,
  ProviderConfig,
  AllProviderStats,
} from "./types";
import { fetchAnthropicStats } from "./anthropic";
import { fetchDeepSeekStats } from "./deepseek";
import { fetchOpenRouterStats } from "./openrouter";
import { fetchGeminiStats } from "./gemini";
import { computeAuditStats, AuditStats } from "./audit-stats";

export type { ProviderStats, ProviderConfig, AllProviderStats, AuditStats };

export { computeAuditStats };

export async function fetchAllProviderStats(
  config: ProviderConfig
): Promise<ProviderStats[]> {
  const fetchers: Array<Promise<ProviderStats>> = [];

  if (config.anthropicAdminKey) {
    fetchers.push(fetchAnthropicStats(config.anthropicAdminKey));
  } else {
    fetchers.push(
      Promise.resolve({
        provider: "anthropic",
        label: "Anthropic Claude",
        status: "unconfigured",
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: "", end: "" },
      })
    );
  }

  if (config.deepseekKey) {
    fetchers.push(fetchDeepSeekStats(config.deepseekKey));
  } else {
    fetchers.push(
      Promise.resolve({
        provider: "deepseek",
        label: "DeepSeek",
        status: "unconfigured",
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: "", end: "" },
      })
    );
  }

  if (config.openrouterKey) {
    fetchers.push(fetchOpenRouterStats(config.openrouterKey));
  } else {
    fetchers.push(
      Promise.resolve({
        provider: "openrouter",
        label: "OpenRouter",
        status: "unconfigured",
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: "", end: "" },
      })
    );
  }

  // Gemini is always included (no simple API, documents manual tracking)
  fetchers.push(fetchGeminiStats());

  const results = await Promise.allSettled(fetchers);

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // If a fetcher throws, return error state
    const providerNames = [
      "anthropic",
      "deepseek",
      "openrouter",
      "gemini",
    ];
    return {
      provider: providerNames[i] || "unknown",
      label: providerNames[i] || "Unknown",
      status: "error" as const,
      error: String((r as PromiseRejectedResult).reason),
      tokens: { input: 0, output: 0, total: 0 },
      cost: { total: 0, currency: "USD" },
      requests: 0,
      models: [],
      period: { start: "", end: "" },
    };
  });
}

export function buildCombinedStats(
  auditStats: AuditStats,
  providers: ProviderStats[]
): AllProviderStats {
  const activeProviders = providers.filter(
    (p) => p.status === "ok"
  );
  const totalCost = activeProviders.reduce(
    (sum, p) => sum + p.cost.total,
    0
  );
  const totalTokens = activeProviders.reduce(
    (sum, p) => sum + p.tokens.total,
    0
  );
  const providerRequests = activeProviders.reduce(
    (sum, p) => sum + p.requests,
    0
  );

  // Determine dominant currency
  const currency =
    activeProviders.length > 0
      ? activeProviders[0].cost.currency
      : "USD";

  return {
    audit: {
      totals: auditStats.totals,
      by_server: auditStats.by_server,
      by_tool: auditStats.by_tool,
      by_day: auditStats.by_day,
      result_ratio: auditStats.result_ratio,
      by_user: auditStats.by_user,
      top_denied: auditStats.top_denied,
    },
    providers,
    combined: {
      totalCost: Math.round(totalCost * 100) / 100,
      currency,
      totalTokens,
      totalRequests:
        auditStats.totals.all_time + providerRequests,
    },
  };
}
