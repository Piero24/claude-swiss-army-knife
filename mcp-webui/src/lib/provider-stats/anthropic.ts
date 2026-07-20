/** Fetches usage stats from Anthropic's Admin API.
 *  Docs: https://docs.anthropic.com/en/api/usage-cost-admin-api
 *
 *  Requires an Admin API key (NOT an inference key).
 *  The Admin key is created at: https://console.anthropic.com/ → Admin Keys
 */

import type { ProviderStats, ProviderModelStats } from "./types";

const ANTHROPIC_USAGE_URL = "https://api.anthropic.com/v1/messages/usage";

interface AnthropicUsageBucket {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  timestamp: string;
}

interface AnthropicUsageResponse {
  data: AnthropicUsageBucket[];
  has_more: boolean;
}

/** Pricing per 1M tokens (US dollars). Updated 2025-2026. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-8": { input: 15.0, output: 75.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.8, output: 4.0 },
  "claude-3-opus": { input: 15.0, output: 75.0 },
  // Fallback for unknown models
  default: { input: 3.0, output: 15.0 },
};

function getPricing(model: string): { input: number; output: number } {
  // Try exact match first, then prefix match
  for (const [key, price] of Object.entries(MODEL_PRICING)) {
    if (key === "default") continue;
    if (model.startsWith(key)) return price;
  }
  return MODEL_PRICING.default;
}

export async function fetchAnthropicStats(
  adminKey: string
): Promise<ProviderStats> {
  try {
    // Get last 7 days of usage at daily granularity
    const endTime = new Date().toISOString();
    const startTime = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const params = new URLSearchParams({
      start_time: startTime,
      end_time: endTime,
      bucket_granularity: "day",
    });

    const res = await fetch(`${ANTHROPIC_USAGE_URL}?${params}`, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        provider: "anthropic",
        label: "Anthropic Claude",
        status: "error",
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: startTime, end: endTime },
      };
    }

    const json: AnthropicUsageResponse = await res.json();

    // Aggregate by model
    const modelMap = new Map<
      string,
      { input: number; output: number; requests: number }
    >();
    let totalInput = 0;
    let totalOutput = 0;

    for (const bucket of json.data) {
      const key = bucket.model || "unknown";
      const existing = modelMap.get(key) || {
        input: 0,
        output: 0,
        requests: 0,
      };
      existing.input += bucket.input_tokens || 0;
      existing.output += bucket.output_tokens || 0;
      existing.requests += 1;
      modelMap.set(key, existing);
      totalInput += bucket.input_tokens || 0;
      totalOutput += bucket.output_tokens || 0;
    }

    const models: ProviderModelStats[] = [];
    let totalCost = 0;
    let totalRequests = 0;

    for (const [model, data] of modelMap) {
      const pricing = getPricing(model);
      const cost =
        (data.input / 1_000_000) * pricing.input +
        (data.output / 1_000_000) * pricing.output;
      models.push({
        model,
        inputTokens: data.input,
        outputTokens: data.output,
        totalTokens: data.input + data.output,
        cost: Math.round(cost * 100) / 100,
        currency: "USD",
        requests: data.requests,
      });
      totalCost += cost;
      totalRequests += data.requests;
    }

    models.sort((a, b) => b.totalTokens - a.totalTokens);

    return {
      provider: "anthropic",
      label: "Anthropic Claude",
      status: "ok",
      tokens: {
        input: totalInput,
        output: totalOutput,
        total: totalInput + totalOutput,
      },
      cost: {
        total: Math.round(totalCost * 100) / 100,
        currency: "USD",
      },
      requests: totalRequests,
      models,
      period: { start: startTime, end: endTime },
      raw: { bucket_count: json.data.length, has_more: json.has_more },
    };
  } catch (err) {
    return {
      provider: "anthropic",
      label: "Anthropic Claude",
      status: "error",
      error: String(err),
      tokens: { input: 0, output: 0, total: 0 },
      cost: { total: 0, currency: "USD" },
      requests: 0,
      models: [],
      period: { start: "", end: "" },
    };
  }
}
