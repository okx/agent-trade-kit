<!-- triggers: oauth, auth, authentication, bearer, token, okx-auth, binary, login, logout, fd3, device-flow, refresh, credentials, applyAuth, resolveAccessToken, execAuthToken, execAuthStatus, install, remove -->
# OAuth Authentication Subsystem

The OAuth subsystem provides browser-based authentication as an alternative to manual API key configuration. A locally-installed `okx-auth` Rust binary manages the full OAuth 2.1 Device Flow lifecycle — login, token storage, refresh, and revocation — while the Node.js SDK communicates with it via subprocess pipes.

## Design Goal

Manual API key setup (generate on OKX website → copy three values → paste into config) creates friction for new users and AI agents. OAuth eliminates this by enabling a single `okx auth login` command that opens a browser for authorization and stores encrypted tokens locally. The SDK automatically uses these tokens when no API key is configured.

## Architecture

```
OkxRestClient (packages/core/src/client/rest-client.ts)
  └── applyAuth()                  ← dynamic auth selection per request
        ├── [1] API key exists?    → setAuthHeaders() (HMAC signing)
        ├── [2] resolveAccessToken()
        │         ├── cache hit (< 60 s) → return cached token
        │         └── cache miss → execAuthToken()
        │                            └── spawn("okx-auth", ["token"])
        │                                  └── fd3 pipe → read token
        └── [3] neither           → throw ConfigError

loadConfig() (packages/core/src/config.ts)
  └── loadCredentials()
        └── execAuthStatus()       ← detect OAuth login state at startup
              └── execFile("okx-auth", ["status", "--json"])
```

## Auth Priority

The SDK selects an auth method **per request** in `applyAuth()`:

1. **API key HMAC** — If `apiKey`, `secretKey`, and `passphrase` are all present in config, use OKX HMAC signature headers (`OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-PASSPHRASE`, `OK-ACCESS-TIMESTAMP`). No OAuth fallback.
2. **OAuth Bearer token** — Call `resolveAccessToken()` which spawns the `okx-auth` binary to obtain a fresh access token via fd3. Set `Authorization: Bearer <token>` header.
3. **No credentials** — Throw `ConfigError` with suggestion to run `okx auth login` or configure API keys.

This priority is intentional: API key credentials are explicit and deterministic, so they always win when present.

## Token Retrieval via fd3 Pipe

The `execAuthToken()` function in `packages/core/src/auth/binary.ts` spawns the `okx-auth` binary:

```typescript
spawn(binPath, ["token"], {
  stdio: ["ignore", "ignore", "inherit", "pipe"],
  //       stdin    stdout    stderr     fd3 (pipe)
});
```

- **fd3** is used instead of stdout to avoid mixing token data with diagnostic output.
- The binary writes the access token to fd3 and closes it (EOF).
- Node.js reads all chunks from `child.stdio[3]`, concatenates, trims, and returns the token string.
- The binary handles refresh internally — if the access token is expired, it uses the refresh token to obtain a new one before writing to fd3.

### Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| `0` | `SUCCESS` | Token written to fd3 |
| `1` | `UNAUTHORIZED_CALLER` | Caller identity check failed |
| `2` | `NOT_LOGGED_IN` | No stored tokens — user must run `okx auth login` |
| `3` | `REFRESH_FAILED` | Refresh token expired or revoked — re-login required |

Exit codes are mirrored from the Rust binary's `src/error.rs`.

## Token Cache Strategy

Two layers of caching prevent unnecessary binary invocations:

| Layer | Location | TTL | Purpose |
|-------|----------|-----|---------|
| **JS-side** | `OkxRestClient` instance fields (`cachedAccessToken`, `cachedAccessTokenAt`) | 60 s | Avoid spawning the binary on every HTTP request |
| **Binary-side** | `okx-auth` internal storage (scrypt + AES-256-GCM encrypted file) | 300 s refresh lead | Proactively refresh before expiry; serve fresh token on next `token` call |

The 60 s JS cache means the binary is invoked at most once per minute in steady state. The binary's 300 s refresh lead ensures it always has a valid token ready.

## Binary Distribution

The `okx-auth` binary is distributed via CDN, following the same pattern as the DoH resolver:

| Platform | Directory |
|----------|-----------|
| `darwin-arm64` | `darwin-arm64/` |
| `darwin-x64` | `darwin-x64/` |
| `linux-x64` | `linux-x64/` |
| `linux-arm64` | `linux-arm64/` |
| `win32-x64` | `win32-x64/` |

**CDN path template**: `<CDN_HOST>/upgradeapp/tools/oauth/<platformDir>/<binaryName>`

**CDN sources** (shared with DoH, tried in order):
1. `https://static.jingyunyilian.com`
2. `https://static.okx.com`
3. `https://static.coinall.ltd`

Each source provides `checksum.json` with `sha256`, `size`, and `target` for integrity verification. The installer performs atomic replacement (POSIX `rename(2)`, Windows unlink + rename) after hash validation.

Default install path: `~/.okx/bin/okx-auth` (or `okx-auth.exe` on Windows). Override via `OKX_AUTH_BIN` env var.

### `postinstall` Auto-Download

The `scripts/postinstall-notice.js` script attempts best-effort download of both the DoH and okx-auth binaries after `npm install`. Failure is non-fatal. Users can run `okx auth install` manually.

## CLI Commands (`okx auth`)

```
okx auth login [--site <site>] [--manual]   Start OAuth device flow (browser-based login)
okx auth logout                              Revoke tokens and clear local storage
okx auth status [--json]                     Show OAuth session state
okx auth install [--json]                    Download or update the okx-auth binary
okx auth install-status [--json]             Show binary path, size, SHA-256, CDN match
okx auth remove [--force]                    Delete the binary (prompts without --force)
```

Auth status also feeds into:
- `loadConfig()`: `hasAuth` is true when OAuth session is active (even without API keys)
- `okx diagnose`: can check binary existence and login state

## Integration with Config System

At startup, `loadConfig()` calls `loadCredentials()` which:

1. Checks for API key credentials (env vars → TOML profile)
2. If no API key is found, calls `execAuthStatus()` to probe the `okx-auth` binary
3. Sets `hasAuth = true` if either API key or OAuth session is detected
4. Adds the resolved `profile` name to `OkxConfig` (used by the binary for profile-scoped token storage)

This makes the config system aware of OAuth without requiring any user configuration — `hasAuth` drives downstream decisions like whether to attempt private API calls.

## `AuthStatusResult` Type

```typescript
interface AuthStatusResult {
  profile: string;
  site: string;
  status: "logged_in" | "pending" | "not_logged_in";
  expiresAt?: string;
  ttl?: number;
  scopes?: string[];
  apiKey?: boolean;
}
```

Returned by `okx-auth status --json`. The `status` field determines `hasAuth` at config load time.

## Key Files

| File | Role |
|------|------|
| `packages/core/src/auth/binary.ts` | Spawn `okx-auth` binary for `token` (fd3) and `status` (stdout JSON) |
| `packages/core/src/auth/types.ts` | Exit codes and `AuthStatusResult` type |
| `packages/core/src/auth/installer.ts` | CDN download, checksum verify, atomic install/remove |
| `packages/core/src/auth/installer-types.ts` | `AuthLocalStatus` type |
| `packages/core/src/client/rest-client.ts` | `applyAuth()` — dynamic auth selection; `resolveAccessToken()` — JS-side cache |
| `packages/core/src/config.ts` | `loadCredentials()` — probes OAuth state at startup |
| `packages/cli/src/commands/auth.ts` | CLI router for `okx auth {login,logout,status,install,remove,...}` |
| `skills/okx-cex-auth/SKILL.md` | Agent skill documentation for OAuth workflows |
