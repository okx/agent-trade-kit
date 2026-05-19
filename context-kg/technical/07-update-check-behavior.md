# Update-Check Behavior

> Added: TRDATA-3954 — CLI startup perf fix

## Overview

`packages/core/src/utils/update-check.ts` provides background update notifications for the `okx` CLI. It is called at startup by `packages/cli/src/index.ts` and must never block or pin the Node.js event loop.

## Four-Layer Fix (TRDATA-3954)

### B0 — Kill Switch

`OKX_UPDATE_CHECK=false` disables update checks entirely. Only the exact string `"false"` activates it; `"0"`, `"no"`, etc. do NOT suppress checks.

```ts
if (process.env.OKX_UPDATE_CHECK === "false") return;
```

### B1 — Registry Resolution

`resolveNpmRegistry()` finds the configured npm registry using this precedence:

1. `process.env.npm_config_registry` (set by npm/yarn/pnpm or user export)
2. `registry=` key in `.npmrc`, walking up from `process.cwd()` → `~/.npmrc` → `/etc/npmrc`
3. Hard-coded fallback: `https://registry.npmjs.org/`

The function is NOT module-level cached so tests can mutate the env var.

### A' — No Event Loop Pin

`fetchFromRegistry()` uses `AbortSignal.timeout(FETCH_TIMEOUT_MS)` instead of a plain `setTimeout`. Node.js implements `AbortSignal.timeout()` using `setTimeout(...).unref()` internally, which means:

- The timeout timer itself does NOT keep the event loop alive.
- If the underlying connection fails quickly (DNS error, ICMP unreachable), the socket closes and the process can exit without waiting for the timeout.
- On truly unreachable hosts (TCP SYN with no response), the connection socket is ref-counted and the event loop stays alive until the 3-second timeout fires and aborts the fetch.

Maximum hang time: 3 seconds (FETCH_TIMEOUT_MS). This is bounded and predictable, unlike the previous `new AbortController() + setTimeout()` approach which also had a 3-second ref-mode timer that prevented exit even after fast network failures.

### B1.5 — Negative Cache

When `fetchLatestVersion` returns `null`, `refreshCacheInBackground` writes:

```json
{ "latestVersion": null, "checkedAt": <unix_ms>, "failed": true }
```

TTL rules:
- Positive cache (`failed` absent): 24 h (`CHECK_INTERVAL_MS`)
- Negative cache (`failed: true`): 1 h (`NEGATIVE_CHECK_INTERVAL_MS`)

`isNewerVersion(current, null)` returns `false` — no upgrade notice for negative cache entries.

## Cache File

`~/.okx/update-check.json`:

```json
{
  "<package-name>": {
    "latestVersion": "<semver-or-null>",
    "checkedAt": <unix_ms>,
    "failed": true
  }
}
```

## Testing

- `packages/core/test/update-check.test.ts` — unit tests for all four layers (24 cases including existing)
- `packages/cli/test/startup-perf.test.ts` — spawn regression (< 500 ms with `OKX_UPDATE_CHECK=false`; skips when dist not built)
