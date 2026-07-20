/** Standardized provider usage stats returned by all fetchers. */

export interface ProviderModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  currency: string;
  requests: number;
}

export interface ProviderStats {
  provider: string;
  label: string;
  status: "ok" | "error" | "unconfigured";
  error?: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    total: number;
    currency: string;
  };
  requests: number;
  models: ProviderModelStats[];
  period: {
    start: string;
    end: string;
  };
  /** Provider-specific raw data for debugging */
  raw?: Record<string, unknown>;
}

export interface ProviderConfig {
  /** Anthropic Admin API key (different from inference key) */
  anthropicAdminKey?: string;
  /** DeepSeek API key */
  deepseekKey?: string;
  /** OpenRouter API key */
  openrouterKey?: string;
}

export interface AllProviderStats {
  audit: {
    totals: { all_time: number; today: number; this_week: number };
    by_server: Record<string, number>;
    by_tool: Array<{ name: string; count: number }>;
    by_day: Array<{ date: string; count: number }>;
    result_ratio: { allowed: number; denied: number };
    by_user: Array<{ user_id: string; count: number }>;
    top_denied: Array<{ target: string; count: number }>;
  };
  providers: ProviderStats[];
  combined: {
    totalCost: number;
    currency: string;
    totalTokens: number;
    totalRequests: number;
  };
}
