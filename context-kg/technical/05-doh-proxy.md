<!-- triggers: doh, dns, proxy, resolver, binary, cdn, cache, network, postinstall, okx-pilot, DohManager, DohNode, install, remove, prepareDoh, handleNetworkFailure, cacheDirectIfNeeded, doh-cache -->
# DoH (DNS-over-HTTPS) Proxy Subsystem

The DoH subsystem provides transparent network resilience for the REST client. When the OKX API domain is unreachable via direct connection (e.g., DNS poisoning in certain regions), the SDK automatically resolves an alternative proxy node through a locally-installed `okx-pilot` binary.

## Design Goal

Users in restricted network environments may experience DNS poisoning or routing interference that makes `www.okx.com` unreachable. The DoH subsystem detects this at the first failed request and transparently switches to a proxy node — without requiring manual proxy configuration or changes to credentials.

## Architecture

```
DohManager (packages/core/src/doh/manager.ts)
  ├── resolveDoh()           ← resolver.ts: cache-first DNS resolution
  │     └── readCache()      ← cache.ts
  ├── reResolveDoh()         ← resolver.ts: re-resolve with --exclude after failure
  │     ├── execDohBinary()  ← binary.ts: invoke okx-pilot
  │     └── writeCache()     ← cache.ts: persist new proxy node
  └── cacheDirectIfNeeded()  ← calls writeCache() directly for mode=direct
```

The `DohManager` class encapsulates all DoH state and is the sole entry point for the REST client. `writeCache()` is called both from within `resolver.ts` (after binary resolution) and directly by `DohManager.cacheDirectIfNeeded()` (after a successful direct connection).

### Request Lifecycle

1. **First request**: `prepareDoh()` checks the cache (`~/.okx/doh-cache.json`).
   - Cache miss → try direct connection; mark `directUnverified = true`
   - Cache `mode=direct` → skip DoH entirely
   - Cache `mode=proxy` → apply the cached proxy node (set up custom `undici.Agent`)
2. **Successful direct response**: `cacheDirectIfNeeded()` writes `mode=direct` to cache
3. **Network failure**: `handleNetworkFailure()` invokes the binary with `--exclude <failedIp>`, updates cache, and signals the REST client to retry once

### Cache Strategy

- Cache file: `~/.okx/doh-cache.json` (per-hostname entries)
- Entry fields: `mode` (`"direct"` | `"proxy"`), `node` (ip, host, ttl), `failedNodes` (array of `{ ip, failedAt }`), `updatedAt`
- Failed nodes older than **1 hour** are automatically evicted from the `failedNodes` list
- In long-running processes (e.g., MCP server), a successful re-resolution resets `dohRetried = false` to allow future recovery

## Binary Distribution

The `okx-pilot` binary is a platform-native executable distributed via CDN:

| Platform | Directory |
|----------|-----------|
| `darwin-arm64` | `darwin-arm64/` |
| `darwin-x64` | `darwin-x64/` |
| `linux-x64` | `linux-x64/` |
| `win32-x64` | `win32-x64/` |

**CDN sources** (tried in order, first success wins):
1. `https://static.jingyunyilian.com`
2. `https://static.okx.com`
3. `https://static.coinall.ltd`

Path template: `<CDN_HOST>/upgradeapp/doh/<platformDir>/<binaryName>`

Each CDN source also provides `checksum.json` with `sha256`, `size`, and `target` for integrity verification. The installer atomically replaces the existing binary (POSIX: `rename(2)`; Windows: unlink + rename) and verifies hash before committing.

Default install path: `~/.okx/bin/okx-pilot` (or `okx-pilot.exe` on Windows). Override via `OKX_DOH_BINARY_PATH` env var.

### `postinstall` Auto-Download

After `npm install` / `pnpm install`, the `postinstall` script (`scripts/postinstall-notice.js`) attempts a best-effort download of the binary. Failure is non-fatal — the install always succeeds. Users on restricted networks can run `okx doh install` manually later.

## `DohNode` — Proxy Node Structure

```typescript
interface DohNode {
  ip: string;   // IP address or CNAME (e.g. "*.aliyunddos1021.com")
  host: string; // SNI hostname for TLS
  ttl: number;  // Time-to-live in seconds
}
```

`node.ip` may be a CNAME; the `undici.Agent` calls `dns.lookup` per-connection to stay current with CDN IP rotation. `getConnectionParams()` returns `{ baseUrl, dispatcher, userAgent }` for the REST client to use per request.

## CLI Management Commands (`okx doh`)

```
okx doh status            Show binary path, file size, SHA-256, CDN match status
okx doh install           Download or update the binary from CDN
okx doh remove [--force]  Delete the binary (prompts for confirmation without --force)
```

DoH status also appears in:
- `okx --version`: second line shows `DoH resolver: installed (darwin-arm64)` or `not installed`
- `okx diagnose`: DoH section with binary existence, CDN checksum match, and runtime cache mode

## Verbose Logging

With `--verbose`, the REST client (via `DohManager`) emits lifecycle events to stderr:

```
[verbose] DoH: no cache, trying direct connection first
[verbose] DoH: direct connection succeeded, cached mode=direct
[verbose] DoH proxy active: → 1.2.3.4 (node-host.okx.com), ttl=300s
[verbose] DoH: proxy node 1.2.3.4 failed, re-resolving with --exclude
```

## Key Files

| File | Role |
|------|------|
| `packages/core/src/doh/manager.ts` | Orchestrator — state machine, cache reads/writes, retry logic |
| `packages/core/src/doh/resolver.ts` | Cache-first resolution + re-resolution with exclusions |
| `packages/core/src/doh/cache.ts` | Read/write `~/.okx/doh-cache.json` |
| `packages/core/src/doh/binary.ts` | Execute `okx-pilot` binary, parse JSON output |
| `packages/core/src/doh/installer.ts` | Download, verify, and install binary from CDN |
| `packages/core/src/doh/installer-types.ts` | Types: `DohLocalStatus`, `InstallResult`, `RemoveResult`, `CdnSource` |
| `packages/core/src/doh/types.ts` | Core types: `DohNode`, `FailedNode`, `DohCacheEntry` |

## Interaction with Custom Proxy (`proxyUrl`)

If `proxyUrl` is configured in the user's profile, DoH is **disabled entirely** (`hasCustomProxy: true` → `prepareDoh()` returns immediately). The two mechanisms are mutually exclusive — a custom SOCKS/HTTP proxy is assumed to handle connectivity.
