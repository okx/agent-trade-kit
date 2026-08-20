<!-- triggers: config, toml, profile, env, credential, api-key, demo, live, site, module, readOnly, proxy, OkxConfig, OkxProfile, setup, default_profile -->
# Configuration System

## Config File Location

The default config file is `~/.okx/config.toml`. Users copy `config.toml.example` from the repo as a starting point. The config is parsed by `packages/core/src/config/toml.ts` using the `smol-toml` library.

## Config Schema

```toml
default_profile = "demo"   # Which profile to use by default

[profiles.live]
api_key    = "xxx"
secret_key = "xxx"
passphrase = "xxx"

[profiles.demo]
api_key    = "xxx"
secret_key = "xxx"
passphrase = "xxx"
demo       = true          # Enables OKX paper trading (demo) mode

# Optional:
proxy_url = "http://127.0.0.1:7890"
```

## Credential Priority Order

Credentials are resolved in this order (first found wins):

1. **Environment variables**: `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `OKX_DEMO` (set `1` for demo mode)
2. **Named profile** (`--profile` flag or `default_profile` in toml)
3. **Default profile** (the `default_profile` key in the toml file)

When using environment variables, no toml file is required. This is the recommended approach for CI/CD and Docker deployments.

## Site System (Multi-Region)

Four OKX regional API endpoints are supported, configured via `site` parameter:

| Site ID | Base URL | Region |
|---------|----------|--------|
| `global` (default) | `https://www.okx.com` | Global (most users) |
| `eea` | `https://eea.okx.com` | EU / EEA regulated |
| `us` | `https://us.okx.com` | US regulated |
| `tr` | `https://tr.okx.com` | Türkiye |

The `site` value is resolved in `packages/core/src/constants.ts`. EEA and US have endpoint restrictions — see `docs/site-compatibility.md` for the full compatibility matrix.

Site resolution priority (in `resolveSite`, `packages/core/src/config.ts`): `--site` flag > `OKX_SITE` env > toml `site` > **OAuth session site** > `"global"`. The OAuth session site is read from `okx-auth status` (`AuthStatusResult.site`) and used only when the user did not set a site explicitly — so an OAuth token issued on a non-global site (e.g. EEA) routes to the correct host by default instead of 401ing against `global`. It is read at load time, never persisted. When an explicit site conflicts with the OAuth login site, a warning is written to stderr and the explicit site is honored.

## Module Filter

The `modules` config key controls which tool groups are loaded. It is passed via CLI `--modules` flag (comma-separated):

```
okx --modules spot,swap,market,account <command>
```

Special shorthands:
- `all` → expands to every known module
- `earn` / `earn.all` → expands to `[earn.savings, earn.onchain, earn.dcd, earn.autoearn]`
- `bot` → expands to `[bot.grid]` only
- `bot.all` → expands to `[bot.grid, bot.dca]`

**Default modules** (when `--modules` is not specified): `["spot", "swap", "option", "account", "bot.grid", "skills"]`. Note: `market`, `futures`, `earn.*` and `bot.dca` are **not** loaded by default. This expansion happens in `packages/core/src/config.ts`.

## Read-Only Mode

Setting `readOnly: true` in config (or `--read-only` CLI flag) removes all tools where `isWrite: true` from the tool list. This creates a safe, analysis-only agent that cannot execute trades or move funds.

## Demo vs Live Mode

- `demo: true` in profile → uses OKX paper trading environment (separate balances, no real money)
- Demo API keys are obtained from the OKX website under "Demo Trading → API Management"
- Demo mode changes the request header `x-simulated-trading: 1` — no URL difference

## Proxy Configuration

### Automatic environment variable proxy (recommended)

The SDK automatically routes all undici-based fetch calls through the system proxy when `HTTPS_PROXY` or `HTTP_PROXY` is set. This is handled by `packages/core/src/runtime/undici-proxy-bootstrap.ts`, which registers `EnvHttpProxyAgent` as the global undici dispatcher on import — but **only when a proxy env var is actually set** (`HTTPS_PROXY` / `HTTP_PROXY`, upper- or lower-case). `EnvHttpProxyAgent` is still flagged experimental by Node, so this gating avoids emitting an `ExperimentalWarning` on every command (including local-only ones like `okx skill list` that never make a request). `packages/core/src/index.ts` imports this module as its first statement, so CLI, MCP server, and mcp-gateway all get proxy support transitively.

Supported env vars (standard names):

| Env var | Effect |
|---------|--------|
| `HTTPS_PROXY` | Proxy for HTTPS requests |
| `HTTP_PROXY` | Proxy for HTTP requests |
| `NO_PROXY` | Comma/space-separated hostnames to bypass proxy |

Example:
```sh
export HTTPS_PROXY=http://proxy.corp.example.com:8080
export NO_PROXY=localhost,127.0.0.1,.internal.corp
```

`EnvHttpProxyAgent` reads all env vars (`HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`) at construction time. To pick up a changed proxy env var at runtime, reconstruct and re-register the dispatcher via `setGlobalDispatcher(new EnvHttpProxyAgent())`. Only `http://` and `https://` proxy schemes are supported.

**Precedence**: per-request `dispatcher` option overrides the global dispatcher. The explicit `proxy_url` toml field (below) creates a `ProxyAgent` and passes it per-request — so it takes precedence over `HTTPS_PROXY`/`HTTP_PROXY` when both are set.

### Explicit proxy_url (per-profile override)

`proxy_url` is a **profile-level** field — configure it inside the profile section:

```toml
[profiles.demo]
api_key = "..."
proxy_url = "http://127.0.0.1:7890"
# or with auth:
# proxy_url = "http://user:password@proxy.example.com:8080"
```

Proxy is applied to all REST client requests via `packages/core/src/client/rest-client.ts`. SOCKS proxies are not supported — only `http://` and `https://` scheme.

## OkxConfig Type

The resolved config object (`packages/core/src/config.ts`) has this shape:

```typescript
interface OkxConfig {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  hasAuth: boolean;       // true if all three credentials are present
  baseUrl: string;        // resolved from site (e.g. "https://eea.okx.com")
  timeoutMs: number;
  modules: ModuleId[];    // resolved module list (post-expansion)
  readOnly: boolean;
  demo: boolean;
  site: SiteId;           // "global" | "eea" | "us" | "tr"
  sourceTag: string;      // injected into order placements (default: "MCP")
  proxyUrl?: string;
  userAgent?: string;     // custom User-Agent header for REST requests
  verbose: boolean;
}
```
