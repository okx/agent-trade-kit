<!-- triggers: error, rate-limit, OkxMcpError, ConfigError, ValidationError, NetworkError, OkxApiError, AuthenticationError, RateLimitError, retry, code, token bucket, error handling, REMEDIATION_WARNING, WRITE_ACTION_PATTERN, write-action, remediation, applyRemediationWarning -->
# Error Handling & Rate Limiting

## Error Type Hierarchy

All errors thrown by the core package extend `OkxMcpError` (defined in `packages/core/src/utils/errors.ts`). Six concrete subtypes:

| Class | When thrown |
|-------|-------------|
| `ConfigError` | Missing or invalid configuration (bad API key format, unknown site, missing profile) |
| `AuthenticationError` | OKX API returns authentication failure (wrong credentials, expired passphrase) |
| `ValidationError` | Input parameters fail zod schema validation before the API call is made |
| `NetworkError` | HTTP connection failure, DNS resolution failure, timeout |
| `RateLimitError` | Local token bucket exhausted or OKX API returns 429 |
| `OkxApiError` | OKX API returns a non-zero `code` in the response body (business logic error) |

## OkxApiError and Code Behaviors

OKX API errors always include a numeric `code` field. The `OKX_CODE_BEHAVIORS` table in `packages/core/src/client/rest-client.ts` classifies these codes:

- **Retryable codes** (e.g., `50001` — service unavailable): the client will retry up to N times with exponential backoff
- **Non-retryable codes** (e.g., `50011` — rate limit exceeded from API side): throw `RateLimitError` immediately
- **Auth codes** (e.g., `50111`, `50113`): throw `AuthenticationError` — retrying won't help

Common OKX error codes to know:
- `50000` — Success (not an error)
- `50001` — System busy (retryable)
- `50011` — Too many requests (OKX-side rate limit)
- `50102` — Timestamp mismatch (clock skew > 30s)
- `50111` — Invalid API key
- `51155` — Feature not supported in this region (EEA/US restriction)
- `51734` — Instrument not available in current account mode

## toToolErrorPayload

When a tool handler throws, the MCP server catches the error and serializes it via `toToolErrorPayload(error)` (defined in `packages/core/src/utils/errors.ts`):

```typescript
// Returns ToolErrorPayload
{
  error: true,
  type: ErrorType,       // e.g. "OkxApiError", "ConfigError"
  code?: string,         // OKX API error code if applicable
  message: string,       // human-readable description
  suggestion?: string,   // remediation hint
  endpoint?: string,     // API endpoint that failed
  traceId?: string,
  timestamp: string,
}
```

This ensures the AI model receives structured error info rather than a raw exception stack trace. The model can use `type` to categorize the error and `suggestion` to decide next steps.

## Write-Action Remediation Warning (MR !229)

When an `OkxApiError` message matches `WRITE_ACTION_PATTERN` (defined in `packages/mcp/src/server.ts`), the MCP server appends `REMEDIATION_WARNING` to the `suggestion` field before sending the error response.

```typescript
// WRITE_ACTION_PATTERN — matches messages suggesting write operations as remediation
const WRITE_ACTION_PATTERN = /\b(cancel|close|stop|transfer|withdraw|redeem)\b.*\b(orders?|positions?|bots?|strateg|before|first)\b/i;

// REMEDIATION_WARNING — injected into suggestion when pattern matches
const REMEDIATION_WARNING =
  "⚠ The error message suggests a remediation that involves write operations " +
  "(cancel/close/stop). Do NOT execute those automatically. " +
  "Use read-only tools to diagnose first, then ask the user for confirmation.";
```

**Why**: OKX API errors for leverage/mode changes include messages like "Cancel cross-margin TP/SL orders before adjusting leverage" as their suggested action. Without the warning, an agent following the suggestion verbatim would automatically cancel orders — a destructive write operation — without user confirmation.

**Injection path**: `tool.handler throws OkxApiError` → `errorResult()` → `toToolErrorPayload()` → `applyRemediationWarning(payload.suggestion, payload.message)` → `suggestion` field in MCP response.

**Integration test**: `packages/mcp/test/errorresult-integration.test.ts` — `describe("errorResult integration")` — uses `node:test mock.module()` to stub `buildTools` from `@agent-tradekit/core`, then drives a real tool call and asserts that `result.isError === true`, `payload.suggestion` contains `REMEDIATION_WARNING`, and `payload.message` contains the original error text. This test guards against regressions in `toToolErrorPayload`'s return shape — a rename of the `message` field would break injection silently, but this test catches it.

**Shape-change guard**: The unit tests in `describe("applyRemediationWarning")` verify the helper in isolation. Only the integration test verifies the full pipeline including `toToolErrorPayload`.

## Local Rate Limiter (Token Bucket)

`packages/core/src/client/rest-client.ts` implements a token bucket rate limiter to prevent hitting OKX's per-endpoint rate limits:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `capacity` | varies | Max burst tokens (configured per endpoint type) |
| `refillPerSecond` | varies | Tokens added per second (configured per endpoint type) |
| `maxWaitMs` | 30000 | Max time to wait for a token before throwing `RateLimitError` (30 seconds) |

The bucket is shared across all API calls within a single process. If a burst of tool calls exhausts the bucket, subsequent calls will wait up to `maxWaitMs` before failing.

**Implication for bulk operations**: When an agent needs to fetch data for 50+ instruments, it should paginate and pace requests rather than sending all at once. See `technical/01-architecture.md` for the large-data-volume guard rule.

## Error Handling in CLI

The CLI catches errors in `packages/cli/src/index.ts` and:
1. Prints the error message to stderr
2. Exits with code 1

For `OkxApiError`, the CLI also prints the `code` field to help users diagnose API-level issues.

## Debugging Tips

- **Clock skew error (50102)**: check system time — OKX requires the request timestamp to be within 30 seconds of server time
- **Invalid API key (50111)**: verify credentials are for the correct environment (demo vs live API keys are different)
- **Feature not supported (51155)**: check `docs/site-compatibility.md` — the endpoint may not be available for your regional site
- **Rate limit**: reduce request frequency or increase `maxWaitMs` in client config
