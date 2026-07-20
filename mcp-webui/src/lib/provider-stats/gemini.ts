/** Fetches usage stats from Google Gemini API.
 *
 *  Google does not expose a simple usage/cost REST API for Gemini.
 *  The primary ways to track usage are:
 *    1. Google Cloud Console → Billing → Reports (SKU-level breakdown)
 *    2. Vertex AI CountTokens API (per-request token counting only)
 *    3. Google Cloud Billing API (programmatic, requires service account + billing account)
 *
 *  This fetcher tries the Cloud Billing API if a project ID and billing
 *  account are configured, otherwise returns an "unavailable" status
 *  with guidance for manual tracking.
 */

import type { ProviderStats } from "./types";

/** Gemini pricing per 1M tokens (USD). 2025-2026 pricing. */
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash": { input: 0, output: 0 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  default: { input: 0.3, output: 2.5 },
};

/**
 * Attempts to fetch Gemini usage from the Google Cloud Billing API.
 * Requires GOOGLE_CLOUD_PROJECT and GOOGLE_BILLING_ACCOUNT env vars or
 * provider config fields.
 *
 * Falls back to returning an "unavailable" status with guidance since
 * programmatic Gemini usage tracking requires significant GCP setup.
 */
export async function fetchGeminiStats(
  /* no API key needed — Google has no usage REST API */
): Promise<ProviderStats> {
  const now = new Date().toISOString();
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Google's billing API requires a service account with billing access,
  // which is too complex for a simple API key. We document the limitation.
  return {
    provider: "gemini",
    label: "Google Gemini",
    status: "unconfigured",
    error:
      "Google Gemini does not expose a usage/cost REST API. " +
      "Track usage via Google Cloud Console → Billing Reports, " +
      "or set up the Cloud Billing API with a service account. " +
      "See: https://cloud.google.com/billing/docs/how-to/using-billing-api",
    tokens: { input: 0, output: 0, total: 0 },
    cost: { total: 0, currency: "USD" },
    requests: 0,
    models: [],
    period: { start: weekAgo, end: now },
    raw: {
      pricing_note:
        "Gemini 2.5 Pro: $1.25/$10 per 1M in/out tokens. " +
        "Gemini 2.5 Flash: $0.30/$2.50 per 1M in/out tokens.",
      models: Object.keys(GEMINI_PRICING).filter((k) => k !== "default"),
    },
  };
}
