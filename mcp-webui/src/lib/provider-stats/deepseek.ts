/** Fetches usage and balance from DeepSeek API.
 *
 *  TESTED with real API key (2026-07-20):
 *    GET /user/balance  → returns balance_infos with currency, total_balance
 *    /v1/usage          → 404 (does not exist)
 *    /v1/usage/records  → empty (no response)
 *
 *  DeepSeek does NOT expose a programmatic token-usage endpoint.
 *  The only available data is the account balance via /user/balance.
 *  For detailed usage, users must visit: https://platform.deepseek.com
 *
 *  Pricing (USD per 1M tokens, DeepSeek V4 2026):
 *    Input:  $0.55  (cache hit: $0.14)
 *    Output: $2.19
 */

import type { ProviderStats } from "./types";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

interface DeepSeekBalanceResponse {
  is_available: boolean;
  balance_infos: Array<{
    currency: string;
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }>;
}

export async function fetchDeepSeekStats(
  apiKey: string
): Promise<ProviderStats> {
  const now = new Date().toISOString();
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const res = await fetch(DEEPSEEK_BALANCE_URL, {
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

    const json: DeepSeekBalanceResponse = await res.json();
    const balances = json.balance_infos || [];
    const totalBalance = balances.reduce(
      (sum, b) => sum + parseFloat(b.total_balance || "0"),
      0
    );
    const currency =
      balances.length > 0 ? balances[0].currency : "USD";

    return {
      provider: "deepseek",
      label: "DeepSeek",
      status: "ok",
      tokens: {
        input: 0,
        output: 0,
        total: 0,
      },
      cost: {
        total: Math.round(totalBalance * 100) / 100,
        currency,
      },
      requests: 0,
      models: [],
      period: { start: weekAgo, end: now },
      raw: {
        note: "DeepSeek does not expose token-level usage via API. Balance shown. Visit platform.deepseek.com for usage details.",
        is_available: json.is_available,
        balances: json.balance_infos,
      },
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
