/** Ollama usage tracking.
 *
 *  Ollama does NOT have a built-in usage aggregation API.
 *  The /api/generate and /api/chat responses include per-request
 *  token counts (prompt_eval_count + eval_count), but there is
 *  no persistent stats endpoint.
 *
 *  Feature request for native stats: https://github.com/ollama/ollama/issues/11118
 *
 *  Options for tracking Ollama usage:
 *    1. ollama-metrics-proxy — transparent proxy that exposes Prometheus /metrics
 *       https://github.com/elliotfehr/ollama-metrics-proxy
 *    2. ollama-exporter — Prometheus exporter for Ollama
 *       https://github.com/frcooper/ollama-exporter
 *    3. Parse Ollama's local logs for token counts per model
 *
 *  NOT YET TESTED with a metrics proxy.
 */

import type { ProviderStats } from "./types";

export async function fetchOllamaStats(
  /* no key needed — Ollama runs locally with no usage API */
): Promise<ProviderStats> {
  const now = new Date().toISOString();
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  return {
    provider: "ollama",
    label: "Ollama",
    status: "unconfigured",
    error:
      "Ollama does not have a built-in usage aggregation API. " +
      "Deploy ollama-metrics-proxy or ollama-exporter to expose " +
      "Prometheus metrics. See: https://github.com/elliotfehr/ollama-metrics-proxy",
    tokens: { input: 0, output: 0, total: 0 },
    cost: { total: 0, currency: "USD" },
    requests: 0,
    models: [],
    period: { start: weekAgo, end: now },
    raw: {
      feature_request: "https://github.com/ollama/ollama/issues/11118",
      proxies: [
        "ollama-metrics-proxy (elliotfehr)",
        "ollama-exporter (frcooper)",
      ],
      note: "Ollama models are free/open-source, but tracking token usage helps with capacity planning.",
    },
  };
}
