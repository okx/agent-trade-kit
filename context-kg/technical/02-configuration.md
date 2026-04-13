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

Three OKX regional API endpoints are supported, configured via `site` parameter:

| Site ID | Base URL | Region |
|---------|----------|--------|
| `global` (default) | `https://www.okx.com` | Global (most users) |
| `eea` | `https://eea.okx.com` | EU / EEA regulated |
| `us` | `https://app.okx.com` | US regulated |

The `site` value is resolved in `packages/core/src/constants.ts`. EEA and US have endpoint restrictions — see `docs/site-compatibility.md` for the full compatibility matrix.

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
  site: SiteId;           // "global" | "eea" | "us"
  sourceTag: string;      // injected into order placements (default: "MCP")
  proxyUrl?: string;
  userAgent?: string;     // custom User-Agent header for REST requests
  verbose: boolean;
}
```
