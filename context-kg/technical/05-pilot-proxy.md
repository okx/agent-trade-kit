<!-- triggers: pilot, dns, proxy, resolver, binary, cdn, cache, network, postinstall, okx-pilot, PilotManager, PilotNode, install, remove, preparePilot, handleNetworkFailure, cacheDirectIfNeeded, pilot-cache -->
# Pilot Proxy Subsystem

The Pilot subsystem provides transparent network resilience for the REST client. When the OKX API domain is unreachable via direct connection (e.g., DNS poisoning in certain regions), the SDK automatically resolves an alternative proxy node through a locally-installed `okx-pilot` binary.

## Design Goal

Users in restricted network environments may experience DNS poisoning or routing interference that makes `www.okx.com` unreachable. The Pilot subsystem detects this at the first failed request and transparently switches to a proxy node — without requiring manual proxy configuration or changes to credentials.

## Architecture

```
PilotManager (packages/core/src/pilot/manager.ts)
  ├── resolvePilot()           ← resolver.ts: cache-first DNS resolution
  │     └── readCache()        ← cache.ts
  ├── reResolvePilot()         ← resolver.ts: re-resolve with --exclude after failure
  │     ├── execPilotBinary()  ← binary.ts: invoke okx-pilot
  │     └── writeCache()       ← cache.ts: persist new proxy node
  └── cacheDirectIfNeeded()    ← calls writeCache() directly for mode=direct
```

The `PilotManager` class encapsulates all Pilot state and is the sole entry point for the REST client. `writeCache()` is called both from within `resolver.ts` (after binary resolution) and directly by `PilotManager.cacheDirectIfNeeded()` (after a successful direct connection).

### Request Lifecycle

1. **First request**: `preparePilot()` checks the cache (`~/.okx/pilot-cache.json`).
   - Cache miss → try direct connection; mark `directUnverified = true`
   - Cache `mode=direct` → skip Pilot entirely
   - Cache `mode=proxy` → apply the cached proxy node (set up custom `undici.Agent`)
2. **Successful direct response**: `cacheDirectIfNeeded()` writes `mode=direct` to cache
3. **Network failure**: `handleNetworkFailure()` invokes the binary with `--exclude <failedIp>`, updates cache, and signals the REST client to retry once

### Cache Strategy

- Cache file: `~/.okx/pilot-cache.json` (per-hostname entries)
- Entry fields: `mode` (`"direct"` | `"proxy"`), `node` (ip, host, ttl), `failedNodes` (array of `{ ip, failedAt }`), `updatedAt`
- Failed nodes older than **1 hour** are automatically evicted from the `failedNodes` list
- In long-running processes (e.g., MCP server), a successful re-resolution resets `pilotRetried = false` to allow future recovery

#### Proxy entry TTL expiry

A `mode=proxy` cache entry is considered stale when:

```
(Date.now() - entry.updatedAt) > min(node.ttl × 1000, 1h)
```

- `node.ttl` is in seconds; zero or very large values are capped to 1 hour.
- A stale entry is ignored by `resolvePilot()`, which returns `{ mode: null }` — same as a cache miss — so the caller falls back to a direct connection attempt, then re-resolves via the binary on network failure.
- **`mode=direct` entries never expire** — direct entries contain no live proxy node that can rot, so they are valid indefinitely.

#### Dead-node HTTP failover

A Pilot-proxied node that appears live (TCP connection succeeds) but is not a valid OKX endpoint will return a non-2xx HTTP response with a non-JSON body (e.g., HTML 405 from a CDN/WAF). The REST client detects this pattern and treats it as a network-level failure:

**Trigger conditions** (all must be true):
1. Pilot proxy is currently active (`isProxyActive`)
2. HTTP response is non-2xx (`!response.ok`)
3. Response body contains no parseable OKX JSON `code` field (`!hasOkxJsonCode(rawText)`)
4. Not already retried for this request (`!hasRetried`)

**Behavior**: calls `handleNetworkFailure()` (same path as network errors), then retries once for `GET` requests or `POST` requests explicitly marked `retryOnNetworkError=true`. Write-once POST endpoints (orders, transfers) are never auto-retried.

**Non-trigger cases** (no failover):
- 2xx responses with business error codes (e.g., code `51008`) — surfaced as `OkxApiError` to the caller
- Non-2xx responses that **do** carry a parseable OKX JSON code (e.g., `401` with `{code: "50111"}`) — surfaced as `OkxApiError` to the caller
- Direct-mode requests (no Pilot proxy active)

## Binary Distribution

The `okx-pilot` binary is a platform-native executable distributed via CDN:

| Platform | Directory |
|----------|-----------|
| `darwin-arm64` | `darwin-arm64/` |
| `darwin-x64` | `darwin-x64/` |
| `linux-x64` | `linux-x64/` |
| `linux-arm64` | `linux-arm64/` |
| `win32-x64` | `win32-x64/` |

**CDN sources** (tried in order, first success wins):
1. `https://static.jingyunyilian.com`
2. `https://static.okx.com`
3. `https://static.coinall.ltd`

Path template: `<CDN_HOST>/upgradeapp/tools/pilot/<platformDir>/<binaryName>`

Each CDN source also provides `checksum.json` with `sha256`, `size`, and `target` for integrity verification. The installer atomically replaces the existing binary (POSIX: `rename(2)`; Windows: unlink + rename) and verifies hash before committing.

Default install path: `~/.okx/bin/okx-pilot` (or `okx-pilot.exe` on Windows). Override via `OKX_PILOT_BINARY_PATH` env var.

### `postinstall` Auto-Download

After `npm install` / `pnpm install`, the `postinstall` script (`scripts/postinstall-notice.js`) attempts a best-effort download of the binary. Failure is non-fatal — the install always succeeds. Users on restricted networks can run `okx pilot install` manually later.

## `PilotNode` — Proxy Node Structure

```typescript
interface PilotNode {
  ip: string;   // IP address or CNAME (e.g. "*.aliyunddos1021.com")
  host: string; // SNI hostname for TLS
  ttl: number;  // Time-to-live in seconds
}
```

`node.ip` may be a CNAME; the `undici.Agent` calls `dns.lookup` per-connection to stay current with CDN IP rotation. `getConnectionParams()` returns `{ baseUrl, dispatcher, userAgent }` for the REST client to use per request.

## CLI Management Commands (`okx pilot`)

```
okx pilot status            Show binary path, file size, SHA-256, CDN match status
okx pilot install           Download or update the binary from CDN
okx pilot remove [--force]  Delete the binary (prompts for confirmation without --force)
```

Pilot status also appears in:
- `okx --version`: second line shows `Pilot: installed (darwin-arm64)` or `not installed`
- `okx diagnose`: Pilot section with binary existence, CDN checksum match, and runtime cache mode

## Verbose Logging

With `--verbose`, the REST client (via `PilotManager`) emits lifecycle events to stderr:

```
[verbose] Pilot: no cache, trying direct connection first
[verbose] Pilot: direct connection succeeded, cached mode=direct
[verbose] Pilot proxy active: → 1.2.3.4 (node-host.okx.com), ttl=300s
[verbose] Pilot: proxy node 1.2.3.4 failed, re-resolving with --exclude
```

## Key Files

| File | Role |
|------|------|
| `packages/core/src/pilot/manager.ts` | Orchestrator — state machine, cache reads/writes, retry logic |
| `packages/core/src/pilot/resolver.ts` | Cache-first resolution + re-resolution with exclusions |
| `packages/core/src/pilot/cache.ts` | Read/write `~/.okx/pilot-cache.json` |
| `packages/core/src/pilot/binary.ts` | Execute `okx-pilot` binary, parse JSON output |
| `packages/core/src/pilot/installer.ts` | Download, verify, and install binary from CDN |
| `packages/core/src/pilot/installer-types.ts` | Types: `PilotLocalStatus`, `InstallResult`, `RemoveResult`, `CdnSource` |
| `packages/core/src/pilot/types.ts` | Core types: `PilotNode`, `FailedNode`, `PilotCacheEntry` |

## Same-source `fetch` requirement

`OkxRestClient` imports both `fetch` and `ProxyAgent` from the project's `undici` dependency
(`^6.0.0`). They **must** come from the same undici instance so the dispatcher `onError` handler
interface is consistent. On Node 26+, the Node built-in `globalThis.fetch` is backed by an
internal undici v8 copy; feeding a v6 `ProxyAgent` as the dispatcher to that fetch raises
`UND_ERR_INVALID_ARG: invalid onError method` before any network I/O.

**Rule**: never use `globalThis.fetch` (or bare `fetch`) in any code path that accepts a
`ProxyAgent` dispatcher. Always import `fetch` explicitly from `undici`:

```ts
import { fetch, ProxyAgent } from "undici";
```

The same rule applies to `update-check.ts` — that module calls `fetch()` when
`HTTPS_PROXY`/`HTTP_PROXY` is set; the global undici dispatcher registered by
`undici-proxy-bootstrap.ts` is an `EnvHttpProxyAgent` from undici v6, so it has
the same interface requirement.

## Interaction with Custom Proxy (`proxyUrl`)

The SDK supports three proxy mechanisms; they interact with Pilot differently:

| Mechanism | How configured | Pilot behavior |
|-----------|----------------|----------------|
| `proxyUrl` (per-profile toml field) | `proxy_url = "http://..."` in `[profiles.X]` | Pilot is **disabled entirely** (`hasCustomProxy: true` → `preparePilot()` returns immediately). The two mechanisms are mutually exclusive — a custom SOCKS/HTTP proxy is assumed to handle connectivity. |
| `HTTPS_PROXY` / `HTTP_PROXY` env vars | Set in the shell environment | Pilot remains **fully active**. The env-proxy dispatcher is registered globally via `EnvHttpProxyAgent`. The effect on outgoing requests depends on Pilot mode: in **`direct` mode** (cache says direct connection works), requests travel through the env proxy via the global `EnvHttpProxyAgent`. In **`proxy` mode** (Pilot has an active proxy node), `getConnectionParams()` returns a per-request undici `Agent` pointing to the Pilot node; this per-request dispatcher takes precedence over the global `EnvHttpProxyAgent`, so traffic is routed through the Pilot node rather than the env proxy. In practice, Pilot `proxy` mode activates only in DNS-restricted regions, where corporate-proxy environments (`HTTPS_PROXY`) are uncommon — but the two mechanisms are not transparent to each other in that mode. |
| No proxy configured | (default) | Pilot operates as described above (cache-first direct connection, fallback to proxy node). |

**Summary**: only the explicit `proxyUrl` toml field disables Pilot. Setting `HTTPS_PROXY` / `HTTP_PROXY` does **not** disable Pilot; Pilot state machines run regardless. When Pilot is in `direct` mode, outgoing requests travel through `EnvHttpProxyAgent` (the global dispatcher). When Pilot is in `proxy` mode, the per-request undici `Agent` returned by `getConnectionParams()` takes precedence over the global dispatcher, so env-proxy settings have no effect on Pilot-routed traffic in that mode.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OKX_PILOT_BINARY_PATH` | Override the default binary path (`~/.okx/bin/okx-pilot`) |
| `OKX_PILOT_CACHE_PATH` | Override the default cache path (`~/.okx/pilot-cache.json`) |
| `HTTPS_PROXY` | Route HTTPS requests through a proxy (does not affect Pilot state) |
| `HTTP_PROXY` | Route HTTP requests through a proxy (does not affect Pilot state) |
| `NO_PROXY` | Comma/space-separated hostnames to bypass the env proxy |
