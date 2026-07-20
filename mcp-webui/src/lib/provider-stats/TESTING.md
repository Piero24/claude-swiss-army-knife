# Provider Testing Status (2026-07-20)

Only **DeepSeek** has been tested with a real API key.
Update this list as you test other providers.

| Provider | Tested | Real Key? | Endpoint Works | Notes |
|----------|--------|-----------|----------------|-------|
| DeepSeek | ✅ | Yes (sk-db...) | `/user/balance` ✅ | Returns balance_infos. No token-usage API exists. `/v1/usage` → 404 |
| Anthropic | ❌ | No | Unknown | Needs Admin API key from console.anthropic.com |
| OpenAI | ❌ | No | Unknown | Needs Admin key (sk-admin-...) from platform.openai.com |
| OpenRouter | ❌ | No | Unknown | Standard key should work for `/auth/key` + `/activity` |
| Ollama | ❌ | N/A | No API exists | Needs metrics-proxy for token tracking |
| Google Gemini | ❌ | N/A | No API exists | GCP Console Billing Reports only |

## What to test

When you have a valid API key for a provider:

1. Add the key to Settings → Provider API Keys
2. Go to Dashboard → click "Load AI provider stats"
3. Verify the provider card shows real data (not "unconfigured" or an error)
4. Check the `raw` field in the response for debugging info
5. Update this file

## DeepSeek findings (tested 2026-07-20)

- `GET /user/balance` with `Authorization: Bearer sk-...` returns:
  ```json
  {
    "is_available": true,
    "balance_infos": [{
      "currency": "USD",
      "total_balance": "8.23",
      "granted_balance": "0.00",
      "topped_up_balance": "8.23"
    }]
  }
  ```
- `GET /v1/usage` → 404
- `GET /v1/usage/records` → empty response
- `GET /platform/api/usage` → "Not Found"

**Conclusion**: DeepSeek only exposes balance via API. Token-level usage requires
visiting https://platform.deepseek.com manually. Our fetcher shows balance only.
