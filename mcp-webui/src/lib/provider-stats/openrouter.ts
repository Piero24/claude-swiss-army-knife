/** Fetches usage stats from OpenRouter API.
 *  Uses the standard API key to query the auth/key endpoint.
 *  Docs: https://openrouter.ai/docs/api-reference/overview
 */

import type { ProviderStats, ProviderModelStats } from "./types";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";
const OPENROUTER_ACTIVITY_URL = "https://openrouter.ai/api/v1/activity";

interface OpenRouterKeyResponse {
  data: {
    label: string;
    limit: number;
    usage: number;
    limit_remaining: number;
    rate_limit: {
      requests: number;
      interval: string;
    };
    is_free_tier: boolean;
    created_at: string;
    disabled: boolean;
  };
}

interface OpenRouterActivityResponse {
  data: Array<{
    model: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_cost: number;
    num_requests: number;
    day: string;
  }>;
}

export async function fetchOpenRouterStats(
  apiKey: string
): Promise<ProviderStats> {
  const now = new Date().toISOString();
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    // Fetch key info (credits usage) and activity in parallel
    const [keyRes, activityRes] = await Promise.all([
      fetch(OPENROUTER_KEY_URL, {
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
      }),
      fetch(
        `${OPENROUTER_ACTIVITY_URL}?from=${encodeURIComponent(weekAgo)}&to=${encodeURIComponent(now)}`,
        {
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
        },
      ).catch(() => null),
    ]);

    if (!keyRes.ok) {
      const body = await keyRes.text();
      return {
        provider: "openrouter",
        label: "OpenRouter",
        status: "error",
        error: `HTTP ${keyRes.status}: ${body.slice(0, 200)}`,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { total: 0, currency: "USD" },
        requests: 0,
        models: [],
        period: { start: weekAgo, end: now },
      };
    }

    const keyData: OpenRouterKeyResponse = await keyRes.json();
    const keyInfo = keyData.data;

    // Parse activity if available
    const models: ProviderModelStats[] = [];
    let totalTokens = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let totalRequests = 0;

    if (activityRes?.ok) {
      const activityData: OpenRouterActivityResponse =
        await activityRes.json();
      const modelMap = new Map<
        string,
        {
          input: number;
          output: number;
          cost: number;
          requests: number;
        }
      >();

      for (const rec of activityData.data || []) {
        const key = rec.model || "unknown";
        const existing = modelMap.get(key) || {
          input: 0,
          output: 0,
          cost: 0,
          requests: 0,
        };
        existing.input += rec.prompt_tokens || 0;
        existing.output += rec.completion_tokens || 0;
        existing.cost += rec.total_cost || 0;
        existing.requests += rec.num_requests || 0;
        modelMap.set(key, existing);
        totalInput += rec.prompt_tokens || 0;
        totalOutput += rec.completion_tokens || 0;
        totalCost += rec.total_cost || 0;
        totalRequests += rec.num_requests || 0;
      }
      totalTokens = totalInput + totalOutput;

      for (const [model, data] of modelMap) {
        models.push({
          model,
          inputTokens: data.input,
          outputTokens: data.output,
          totalTokens: data.input + data.output,
          cost: Math.round(data.cost * 100) / 100,
          currency: "USD",
          requests: data.requests,
        });
      }
      models.sort((a, b) => b.totalTokens - a.totalTokens);
    }

    // Use key-level usage as credit consumption
    const creditsUsed = keyInfo.usage || 0;
    const limitRemaining = keyInfo.limit_remaining ?? null;

    return {
      provider: "openrouter",
      label: "OpenRouter",
      status: "ok",
      tokens: {
        input: totalInput,
        output: totalOutput,
        total: totalTokens,
      },
      cost: {
        total: Math.round(Math.max(totalCost, creditsUsed) * 100) / 100,
        currency: "USD",
      },
      requests: totalRequests,
      models,
      period: { start: weekAgo, end: now },
      raw: {
        credits_used: creditsUsed,
        limit_remaining: limitRemaining,
        is_free_tier: keyInfo.is_free_tier,
        label: keyInfo.label,
      },
    };
  } catch (err) {
    return {
      provider: "openrouter",
      label: "OpenRouter",
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
