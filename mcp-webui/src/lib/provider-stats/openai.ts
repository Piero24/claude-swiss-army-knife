/** Fetches usage stats from OpenAI's Usage API.
 *
 *  Docs: https://platform.openai.com/docs/api-reference/usage
 *  Endpoint: GET /v1/organization/usage/completions
 *
 *  Requires an Admin API key (NOT a standard project key sk-...).
 *  Admin keys start with "sk-admin-...".
 *
 *  NOT YET TESTED with a real API key.
 */

import type { ProviderStats, ProviderModelStats } from "./types";

const OPENAI_USAGE_URL =
  "https://api.openai.com/v1/organization/usage/completions";

interface OpenAIUsageBucket {
  input_tokens: number;
  output_tokens: number;
  input_cached_tokens: number;
  num_model_requests: number;
  model?: string;
  timestamp: number;
}

interface OpenAIUsageResponse {
  object: string;
  results: OpenAIUsageBucket[];
  next_page?: string;
}

/** OpenAI pricing per 1M tokens (USD). 2025-2026. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.15, output: 0.6 },
  "gpt-5-nano": { input: 0.025, output: 0.1 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 10, output: 40 },
  default: { input: 2.5, output: 10 },
};

function findPricing(model: string): { input: number; output: number } {
  for (const [key, price] of Object.entries(MODEL_PRICING)) {
    if (key === "default") continue;
    if (model.toLowerCase().includes(key)) return price;
  }
  return MODEL_PRICING.default;
}

export async function fetchOpenAIStats(
  adminKey: string
): Promise<ProviderStats> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 24 * 60 * 60;

  const startTime = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const endTime = new Date().toISOString();

  try {
    const params = new URLSearchParams({
      start_time: String(weekAgo),
      end_time: String(now),
      bucket_width: "1d",
      limit: "30",
    });

    const res = await fetch(`${OPENAI_USAGE_URL}?${params}`, {
      headers: {
        authorization: `Bearer ${adminKey}`,
        "content-type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        provider: "openai",
        label: "OpenAI",
        status: "error",
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: startTime, end: endTime },
      };
    }

    const json: OpenAIUsageResponse = await res.json();

    const modelMap = new Map<
      string,
      { input: number; output: number; cached: number; requests: number }
    >();
    let totalInput = 0;
    let totalOutput = 0;

    for (const bucket of json.results || []) {
      const key = bucket.model || "unknown";
      const existing = modelMap.get(key) || {
        input: 0,
        output: 0,
        cached: 0,
        requests: 0,
      };
      existing.input += bucket.input_tokens || 0;
      existing.output += bucket.output_tokens || 0;
      existing.cached += bucket.input_cached_tokens || 0;
      existing.requests += bucket.num_model_requests || 0;
      modelMap.set(key, existing);
      totalInput += bucket.input_tokens || 0;
      totalOutput += bucket.output_tokens || 0;
    }

    const models: ProviderModelStats[] = [];
    let totalCost = 0;
    let totalRequests = 0;

    for (const [model, data] of modelMap) {
      const pricing = findPricing(model);
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
      provider: "openai",
      label: "OpenAI",
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
      raw: { bucket_count: json.results?.length || 0, has_more: !!json.next_page },
    };
  } catch (err) {
    return {
      provider: "openai",
      label: "OpenAI",
      status: "error",
      error: String(err),
      tokens: { input: 0, output: 0, total: 0 },
      cost: { total: 0, currency: "USD" },
      requests: 0,
      models: [],
      period: { start: startTime, end: endTime },
    };
  }
}
