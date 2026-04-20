[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# OKX Agent Trade Kit — Architecture

## 1. Overview

OKX Agent Trade Kit is an AI-powered trading toolkit for the OKX exchange. It includes an MCP server (`okx-trade-mcp`) and a CLI tool (`okx-trade-cli`), allowing AI agents (Claude Desktop, Cursor, etc.) and developers to query market data, place orders, and manage positions by calling OKX REST API v5 directly.

- **Transport**: stdio — JSON-RPC communication with the host process via standard input/output
- **Runtime**: Node.js >= 18
- **Language**: TypeScript (ESM modules)
- **Build tool**: tsup (esbuild-based)

---

## 2. Directory Structure

```
okx-trade-mcp/
├── packages/
│   ├── core/                        # @agent-tradekit/core — shared library (private)
│   │   └── src/
│   │       ├── client/
│   │       │   ├── rest-client.ts   # HTTP client: signing, requests, response parsing
│   │       │   └── types.ts         # Request/response TypeScript types
│   │       ├── utils/
│   │       │   ├── signature.ts     # ISO timestamp + HMAC-SHA256 signing
│   │       │   ├── rate-limiter.ts  # Token bucket rate limiter
│   │       │   ├── errors.ts        # Error class hierarchy + toToolErrorPayload
│   │       │   └── update-check.ts  # npm update notifier (stderr, cached)
│   │       ├── tools/
│   │       │   ├── types.ts         # ToolSpec interface + toMcpTool conversion
│   │       │   ├── helpers.ts       # Parameter reading/validation utilities
│   │       │   ├── common.ts        # Rate limit config factories + constants
│   │       │   ├── market.ts        # market module (public endpoints)
│   │       │   ├── spot-trade.ts    # spot module (spot trading)
│   │       │   ├── swap-trade.ts    # swap module (perpetual/futures)
│   │       │   ├── account.ts       # account module (balances, transfers)
│   │       │   └── index.ts         # buildTools(): module + read-only filtering
│   │       ├── config/              # Configuration loading (env vars + CLI flags)
│   │       ├── config.ts
│   │       ├── constants.ts         # Module IDs, API base URL, version
│   │       └── index.ts             # Public re-exports
│   ├── mcp/                         # okx-trade-mcp
│   │   └── src/
│   │       ├── server.ts            # MCP Server: ListTools/CallTool handlers
│   │       └── index.ts             # CLI entry: parse args → load config → start server
│   └── cli/                         # okx-trade-cli
│       └── src/
│           └── index.ts             # CLI entry point
├── test/
│   ├── smoke.sh                     # Integration smoke tests (requires credentials)
│   └── mcp-e2e.mjs                  # MCP end-to-end tests (requires credentials)
├── package.json                     # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 3. Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│               MCP Host Process                        │
│      (Claude Desktop / Claude Code / SDK)             │
└──────────────────────┬──────────────────────────────┘
                       │ stdio JSON-RPC
┌──────────────────────▼──────────────────────────────┐
│               index.ts (CLI entry)                    │
│   parseArgs → loadConfig → createServer → connect    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               server.ts (MCP Server)                  │
│   ListToolsHandler  │  CallToolHandler                │
│   buildCapabilitySnapshot  │  errorResult / successResult │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           tools/ (Tool Registration Layer)            │
│   buildTools(config) → ToolSpec[]                     │
│   market / spot-trade / swap-trade / account          │
└──────────────────────┬──────────────────────────────┘
                       │ context.client.*
┌──────────────────────▼──────────────────────────────┐
│           client/rest-client.ts (HTTP Layer)          │
│   publicGet / privateGet / privatePost                │
│   → sign → fetch → parse → error handling            │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│               OKX REST API v5                         │
│             https://www.okx.com                       │
└─────────────────────────────────────────────────────┘
```

---

## 4. Core Modules

### 4.1 Signature (`utils/signature.ts`)

OKX uses an **ISO 8601 timestamp** + **HMAC-SHA256** signature. The signature payload is constructed as:

```
payload = timestamp + METHOD + requestPath + body
```

- `timestamp`: ISO format, e.g. `"2024-01-01T00:00:00.000Z"`
- `METHOD`: uppercase, e.g. `"GET"` / `"POST"`
- `requestPath`: includes query string, e.g. `/api/v5/market/ticker?instId=BTC-USDT`
- `body`: JSON string for POST requests; empty string for GET

Required request headers: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-PASSPHRASE`, `OK-ACCESS-TIMESTAMP`. Demo trading additionally requires the `x-simulated-trading: 1` header.

See `packages/core/src/utils/signature.ts` for implementation details.

### 4.2 REST Client (`client/rest-client.ts`)

Three public methods:

| Method | Auth | Purpose |
|--------|------|---------|
| `publicGet(path, query, rateLimit)` | None | Public market endpoints |
| `privateGet(path, query, rateLimit)` | Yes | Private read endpoints |
| `privatePost(path, body, rateLimit)` | Yes | Private write endpoints |

**Error handling flow:**

```
Network error (fetch throws) → NetworkError
HTTP non-200              → OkxApiError (code = HTTP status)
JSON parse failure         → NetworkError
code !== "0"              → OkxApiError / AuthenticationError
code === "0"              → return RequestResult<TData>
```

See `packages/core/src/client/rest-client.ts` for implementation details.

### 4.3 Rate Limiter (`utils/rate-limiter.ts`)

Token bucket algorithm for client-side rate limiting:

- Each `key` has its own independent bucket
- `capacity`: maximum burst token count
- `refillPerSecond`: steady-state token refill rate
- `maxWaitMs`: maximum wait before throwing `RateLimitError` (default 30s)
- Callers block transparently — automatic sleep + retry

See `packages/core/src/utils/rate-limiter.ts` and `packages/core/src/tools/common.ts` for rate limit configuration factories.

### 4.4 Tool Registry (`tools/`)

Each module exports a `register*Tools(): ToolSpec[]` function. The `ToolSpec` interface defines: tool name, owning module ID (for filtering), description (for AI understanding), JSON Schema input parameters, a write flag (`isWrite`), and an async handler function.

See `packages/core/src/tools/types.ts` for the `ToolSpec` interface definition.

`buildTools(config)` applies two filter passes at startup:
1. **Module filter**: only load modules listed in `config.modules`
2. **Read-only filter**: if `config.readOnly=true`, remove all `isWrite=true` tools

### 4.5 MCP Server (`server.ts`)

Registers two handlers:

**ListToolsHandler**: returns the current tool list plus the `system_get_capabilities` meta-tool.

**CallToolHandler**:
1. Special-cases `system_get_capabilities` → returns capability snapshot
2. Looks up the tool in `toolMap`
3. Calls `tool.handler(args, { config, client })`
4. Returns `successResult` on success; `errorResult` on exception

Each response includes a `CapabilitySnapshot` so the AI agent always knows which modules are active, whether write operations are enabled, and whether demo mode is on.

See `packages/mcp/src/server.ts` for implementation details.

---

## 5. Modules & Tools Inventory

### market module (public — no credentials required)

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `market_get_ticker` | `GET /api/v5/market/ticker` | Single instrument ticker |
| `market_get_tickers` | `GET /api/v5/market/tickers` | Batch tickers by type |
| `market_get_orderbook` | `GET /api/v5/market/books` | Order book (bids/asks) |
| `market_get_candles` | `GET /api/v5/market/candles` | Candlestick (OHLCV) data |

### spot module (credentials required)

| Tool | API Endpoint | Write |
|------|-------------|-------|
| `spot_place_order` | `POST /api/v5/trade/order` | Yes |
| `spot_cancel_order` | `POST /api/v5/trade/cancel-order` | Yes |
| `spot_amend_order` | `POST /api/v5/trade/amend-order` | Yes |
| `spot_get_orders` | `GET /api/v5/trade/orders-pending` or `orders-history` | No |
| `spot_get_fills` | `GET /api/v5/trade/fills` | No |

### swap module (credentials required)

| Tool | API Endpoint | Write |
|------|-------------|-------|
| `swap_place_order` | `POST /api/v5/trade/order` | Yes |
| `swap_cancel_order` | `POST /api/v5/trade/cancel-order` | Yes |
| `swap_get_orders` | `GET /api/v5/trade/orders-pending` or `orders-history` | No |
| `swap_get_positions` | `GET /api/v5/account/positions` | No |
| `swap_set_leverage` | `POST /api/v5/account/set-leverage` | Yes |
| `swap_get_fills` | `GET /api/v5/trade/fills` | No |
| `move_order_stop` | `POST /api/v5/trade/order-algo` | Yes |

### account module (credentials required)

| Tool | API Endpoint | Write |
|------|-------------|-------|
| `account_get_balance` | `GET /api/v5/account/balance` | No |
| `account_transfer` | `POST /api/v5/asset/transfer` | Yes |

---

## 6. Configuration System

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OKX_API_KEY` | For private endpoints | — | API Key |
| `OKX_SECRET_KEY` | For private endpoints | — | Secret Key |
| `OKX_PASSPHRASE` | For private endpoints | — | Passphrase |
| `OKX_API_BASE_URL` | No | `https://www.okx.com` | API base URL |
| `OKX_TIMEOUT_MS` | No | `15000` | Request timeout (ms) |

> The `market` module uses public endpoints — no credentials needed.
> All three keys must be provided together or not at all; partial config throws `ConfigError`.

### TOML Profile File (`~/.okx/config.toml`)

Credentials are organized by named profiles. Each profile contains `api_key`, `secret_key`, `passphrase`, and an optional `demo` flag. A `default_profile` key at the top level selects which profile to use by default.

See `packages/core/src/config/` for configuration loading implementation.

### CLI Flags

The MCP server binary accepts the following flags: `--modules <list>` (comma-separated module names or "all", default: spot,swap,account), `--read-only` (disable all write operations), `--demo` (enable demo trading), `--help`, and `--version`.

See `packages/mcp/src/index.ts` for CLI argument parsing.

---

## 7. Error Handling

All errors extend `OkxMcpError` and are serialized by `toToolErrorPayload()` before being returned to the MCP host:

```
OkxMcpError
├── ConfigError          # Missing or malformed configuration
├── ValidationError      # Tool parameter validation failure
├── AuthenticationError  # API key / signature auth failure (OKX codes 50111-50113)
├── RateLimitError       # Client-side rate limit exceeded
├── OkxApiError          # OKX returned code !== "0"
└── NetworkError         # Network failure, timeout, or non-JSON response
```

Failed tool call responses include the tool name, error flag, error type, OKX error code, human-readable message, the endpoint that failed, and a timestamp.

See `packages/core/src/utils/errors.ts` for the error class hierarchy and serialization logic.

---

## 8. Claude Desktop Configuration

Edit `~/Library/Application\ Support/Claude/claude_desktop_config.json` (macOS) to register MCP servers.

Credentials are read from `~/.okx/config.toml` — only the profile name is needed in the configuration file. Typical setups include:

- **Live trading**: use `--profile live --modules all`
- **Demo trading**: use `--profile demo --modules all`
- **Read-only market data** (no credentials): use `--modules market --read-only`

See the project README for full configuration examples.

---

## 9. Key Differences from Other Exchanges

| Aspect | Bitget (`agent_hub`) | OKX (`agent-tradekit`) |
|--------|---------------------|-----------------|
| Auth header prefix | `ACCESS-*` | `OK-ACCESS-*` |
| Timestamp format | Millisecond string `"1699000000000"` | ISO format `"2024-01-01T00:00:00.000Z"` |
| Signature payload | `ts + METHOD + path?query + body` | `ts + METHOD + requestPath + body` |
| Success code | `"00000"` | `"0"` |
| API path prefix | `/api/v2/` | `/api/v5/` |
| Demo trading | Not supported | `--demo` → `x-simulated-trading: 1` |
| Futures module | `futures` (market + trading combined) | `swap` (SWAP + FUTURES unified) |
| Market module | Split between `spot` and `futures` | Standalone `market` module |

---

## 10. Development Guide

To install dependencies, type-check, build, and run tests, use the standard pnpm commands: `pnpm install`, `pnpm typecheck`, `pnpm build`, and `pnpm test:unit`. For development, run the server directly via `node packages/mcp/dist/index.js`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding new tools and modules.
