/** Fetches usage stats from DeepSeek API.
 *  Uses the standard API key to query the usage endpoint.
 *  Docs: https://platform.deepseek.com/api-docs/
 */

import type { ProviderStats, ProviderModelStats } from "./types";

const DEEPSEEK_USAGE_URL = "https://api.deepseek.com/v1/usage";

interface DeepSeekUsageResponse {
  total_usage?: number;
  used_tokens?: number;
  balance?: number;
  is_available?: boolean;
  // Some API versions return more detail
  usage_records?: Array<{
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    created_at: string;
  }>;
}

/** DeepSeek pricing per 1M tokens (CNY yuan). */
const DEEPSEEK_PRICING: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 3, output: 6 },
  "deepseek-reasoner": { input: 3, output: 6 },
  "deepseek-v3": { input: 3, output: 6 },
  "deepseek-r1": { input: 3, output: 6 },
  default: { input: 3, output: 6 },
};

// Approximate CNY to USD conversion
const CNY_TO_USD = 0.14;

function getPricing(model: string): { input: number; output: number } {
  for (const [key, price] of Object.entries(DEEPSEEK_PRICING)) {
    if (key === "default") continue;
    if (model.toLowerCase().includes(key)) return price;
  }
  return DEEPSEEK_PRICING.default;
}

export async function fetchDeepSeekStats(
  apiKey: string
): Promise<ProviderStats> {
  const now = new Date().toISOString();
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const res = await fetch(DEEPSEEK_USAGE_URL, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        provider: "deepseek",
        label: "DeepSeek",
        status: "error",
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: weekAgo, end: now },
      };
    }

    const json: DeepSeekUsageResponse = await res.json();

    const totalTokens = json.total_usage || json.used_tokens || 0;

    // DeepSeek API typically gives total tokens only, not input/output split
    // We estimate 60% input, 40% output based on typical usage patterns
    const estimatedInput = Math.round(totalTokens * 0.6);
    const estimatedOutput = Math.round(totalTokens * 0.4);

    // Cost uses the default pricing with estimated split
    const pricing = getPricing("deepseek-chat");
    const costCny =
      (estimatedInput / 1_000_000) * pricing.input +
      (estimatedOutput / 1_000_000) * pricing.output;
    const costUsd = Math.round(costCny * CNY_TO_USD * 100) / 100;

    // Build model stats if detailed records are available
    const models: ProviderModelStats[] = [];
    if (json.usage_records && json.usage_records.length > 0) {
      const modelMap = new Map<
        string,
        { input: number; output: number; requests: number }
      >();
      for (const rec of json.usage_records) {
        const key = rec.model || "unknown";
        const existing = modelMap.get(key) || {
          input: 0,
          output: 0,
          requests: 0,
        };
        existing.input += rec.prompt_tokens || 0;
        existing.output += rec.completion_tokens || 0;
        existing.requests += 1;
        modelMap.set(key, existing);
      }

      for (const [model, data] of modelMap) {
        const p = getPricing(model);
        const cost =
          (data.input / 1_000_000) * p.input +
          (data.output / 1_000_000) * p.output;
        models.push({
          model,
          inputTokens: data.input,
          outputTokens: data.output,
          totalTokens: data.input + data.output,
          cost: Math.round(cost * CNY_TO_USD * 100) / 100,
          currency: "USD",
          requests: data.requests,
        });
      }
      models.sort((a, b) => b.totalTokens - a.totalTokens);
    }

    return {
      provider: "deepseek",
      label: "DeepSeek",
      status: "ok",
      tokens: {
        input: estimatedInput,
        output: estimatedOutput,
        total: totalTokens,
      },
      cost: { total: costUsd, currency: "USD" },
      requests: json.usage_records?.length || 0,
      models,
      period: { start: weekAgo, end: now },
      raw: { balance: json.balance, is_available: json.is_available },
    };
  } catch (err) {
    return {
      provider: "deepseek",
      label: "DeepSeek",
      status: "error",
      error: String(err),
      tokens: { input: 0, output: 0, total: 0 },
      cost: { total: 0, currency: "USD" },
      requests: 0,
      models: [],
      period: { start: weekAgo, end: now },
    };
  }
}
