/** Provider stats aggregator — fetches and combines stats from all
 *  configured providers plus the existing audit log stats.
 *
 *  Testing status (2026-07-20):
 *    ✅ DeepSeek — tested with real API key (/user/balance works)
 *    ❌ Anthropic — not tested (needs Admin API key)
 *    ❌ OpenAI — not tested (needs Admin API key sk-admin-...)
 *    ❌ OpenRouter — not tested (needs API key)
 *    ❌ Ollama — no API to test (needs metrics proxy)
 *    ❌ Gemini — no API to test (GCP-only)
 */

import type {
  ProviderStats,
  ProviderConfig,
  AllProviderStats,
} from "./types";
import { fetchAnthropicStats } from "./anthropic";
import { fetchDeepSeekStats } from "./deepseek";
import { fetchOpenRouterStats } from "./openrouter";
import { fetchOpenAIStats } from "./openai";
import { fetchOllamaStats } from "./ollama";
import { fetchGeminiStats } from "./gemini";
import { computeAuditStats, AuditStats } from "./audit-stats";

export type { ProviderStats, ProviderConfig, AllProviderStats, AuditStats };

export { computeAuditStats };

export async function fetchAllProviderStats(
  config: ProviderConfig
): Promise<ProviderStats[]> {
  const fetchers: Array<Promise<ProviderStats>> = [];

  // Anthropic — requires Admin API key
  if (config.anthropicAdminKey) {
    fetchers.push(fetchAnthropicStats(config.anthropicAdminKey));
  } else {
    fetchers.push(unconfiguredProvider("anthropic", "Anthropic Claude"));
  }

  // DeepSeek — standard API key, balance-only (no token usage API)
  if (config.deepseekKey) {
    fetchers.push(fetchDeepSeekStats(config.deepseekKey));
  } else {
    fetchers.push(unconfiguredProvider("deepseek", "DeepSeek"));
  }

  // OpenRouter — standard API key
  if (config.openrouterKey) {
    fetchers.push(fetchOpenRouterStats(config.openrouterKey));
  } else {
    fetchers.push(unconfiguredProvider("openrouter", "OpenRouter"));
  }

  // OpenAI — requires Admin API key (sk-admin-...)
  if (config.openaiAdminKey) {
    fetchers.push(fetchOpenAIStats(config.openaiAdminKey));
  } else {
    fetchers.push(unconfiguredProvider("openai", "OpenAI"));
  }

  // Ollama — no usage API, requires metrics proxy
  fetchers.push(fetchOllamaStats());

  // Gemini — no usage REST API, GCP Console only
  fetchers.push(fetchGeminiStats());

  const results = await Promise.allSettled(fetchers);

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const providerNames = [
      "anthropic",
      "deepseek",
      "openrouter",
      "openai",
      "ollama",
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

function unconfiguredProvider(
  provider: string,
  label: string
): Promise<ProviderStats> {
  return Promise.resolve({
    provider,
    label,
    status: "unconfigured",
    tokens: { input: 0, output: 0, total: 0 },
    cost: { total: 0, currency: "USD" },
    requests: 0,
    models: [],
    period: { start: "", end: "" },
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
