/** GET — aggregated usage statistics from audit logs across all servers
 *  and optionally from configured AI provider APIs.
 *
 *  Query params:
 *    ?providers=true  — also fetch external provider stats (slower, optional)
 */

import { NextResponse } from "next/server";
import {
  computeAuditStats,
  fetchAllProviderStats,
  buildCombinedStats,
  type ProviderConfig,
} from "@/lib/provider-stats";

const CACHE_TTL = 60_000; // 60 seconds for audit stats
const PROVIDER_CACHE_TTL = 300_000; // 5 minutes for provider stats (rate limited)

interface CacheEntry<T> {
  data: T;
  ts: number;
}

let auditCache: CacheEntry<unknown> | null = null;
let providerCache: CacheEntry<unknown> | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeProviders = searchParams.get("providers") === "true";

  const now = Date.now();

  // Audit stats (always computed, cached 60s)
  let auditStats: unknown;
  if (auditCache && now - auditCache.ts < CACHE_TTL) {
    auditStats = auditCache.data;
  } else {
    auditStats = await computeAuditStats();
    auditCache = { data: auditStats, ts: now };
  }

  if (!includeProviders) {
    return NextResponse.json(auditStats);
  }

  // Provider stats (optional, cached 5 min — external API calls are slow/rate-limited)
  if (providerCache && now - providerCache.ts < PROVIDER_CACHE_TTL) {
    return NextResponse.json(providerCache.data);
  }

  const providerConfig = await loadProviderConfig();
  const providers = await fetchAllProviderStats(providerConfig);
  const combined = buildCombinedStats(
    auditStats as Parameters<typeof buildCombinedStats>[0],
    providers
  );

  providerCache = { data: combined, ts: now };
  return NextResponse.json(combined);
}

async function loadProviderConfig(): Promise<ProviderConfig> {
  // Read provider API keys from settings.json or env vars
  const config: ProviderConfig = {};

  // Check environment variables first (for Docker deployments)
  if (process.env.ANTHROPIC_ADMIN_KEY) {
    config.anthropicAdminKey = process.env.ANTHROPIC_ADMIN_KEY;
  }
  if (process.env.DEEPSEEK_API_KEY) {
    config.deepseekKey = process.env.DEEPSEEK_API_KEY;
  }
  if (process.env.OPENROUTER_API_KEY) {
    config.openrouterKey = process.env.OPENROUTER_API_KEY;
  }
  if (process.env.OPENAI_ADMIN_KEY) {
    config.openaiAdminKey = process.env.OPENAI_ADMIN_KEY;
  }

  // Also check settings.json for keys (allows per-deployment config via UI)
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const settingsPath =
      process.env.CONFIGS_PATH
        ? path.join(process.env.CONFIGS_PATH, "settings.json")
        : "/app/configs/settings.json";
    const raw = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);

    if (settings.providerKeys) {
      if (!config.anthropicAdminKey && settings.providerKeys.anthropicAdminKey) {
        config.anthropicAdminKey = settings.providerKeys.anthropicAdminKey;
      }
      if (!config.deepseekKey && settings.providerKeys.deepseekKey) {
        config.deepseekKey = settings.providerKeys.deepseekKey;
      }
      if (!config.openrouterKey && settings.providerKeys.openrouterKey) {
        config.openrouterKey = settings.providerKeys.openrouterKey;
      }
      if (!config.openaiAdminKey && settings.providerKeys.openaiAdminKey) {
        config.openaiAdminKey = settings.providerKeys.openaiAdminKey;
      }
    }
  } catch {
    /* settings.json may not exist — env vars are sufficient */
  }

  return config;
}
