# OKX MCP Server — Architecture

## 1. Overview

OKX MCP Server is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) integration layer for the OKX exchange, allowing AI agents (Claude Desktop, Cursor, etc.) to query market data, place orders, and manage positions by calling OKX REST API v5 directly.

- **Transport**: stdio — JSON-RPC communication with the host process via standard input/output
- **Runtime**: Node.js >= 18
- **Language**: TypeScript (ESM modules)
- **Build tool**: tsup (esbuild-based)

---

## 2. Directory Structure

```
okx-hub/
├── packages/
│   ├── core/                        # @okx-hub/core — shared library (private)
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

OKX uses an **ISO 8601 timestamp** + **HMAC-SHA256** signature. This differs from Bitget (millisecond timestamp):

```
payload = timestamp + METHOD + requestPath + body
```

- `timestamp`: `new Date().toISOString()` → `"2024-01-01T00:00:00.000Z"`
- `METHOD`: uppercase, e.g. `"GET"` / `"POST"`
- `requestPath`: includes query string, e.g. `/api/v5/market/ticker?instId=BTC-USDT`
- `body`: JSON string for POST requests; empty string for GET

Request headers:
```
OK-ACCESS-KEY:        <apiKey>
OK-ACCESS-SIGN:       <base64(hmac-sha256(payload, secretKey))>
OK-ACCESS-PASSPHRASE: <passphrase>
OK-ACCESS-TIMESTAMP:  <isoTimestamp>
```

Demo trading adds:
```
x-simulated-trading: 1
```

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

### 4.3 Rate Limiter (`utils/rate-limiter.ts`)

Token bucket algorithm for client-side rate limiting:

- Each `key` has its own independent bucket
- `capacity`: maximum burst token count
- `refillPerSecond`: steady-state token refill rate
- `maxWaitMs`: maximum wait before throwing `RateLimitError` (default 30s)
- Callers block transparently — automatic sleep + retry

Usage (from `tools/common.ts`):
```typescript
privateRateLimit("spot_place_order", 60)
// → { key: "private:spot_place_order", capacity: 60, refillPerSecond: 60 }
```

### 4.4 Tool Registry (`tools/`)

Each module exports a `register*Tools(): ToolSpec[]` function. The `ToolSpec` structure:

```typescript
interface ToolSpec {
  name: string;            // Tool name, e.g. "spot_place_order"
  module: ModuleId;        // Owning module, used for filtering
  description: string;     // MCP tool description (for AI understanding)
  inputSchema: JsonSchema; // JSON Schema defining parameter structure
  isWrite: boolean;        // true = write operation, filtered in read-only mode
  handler: (args, context) => Promise<unknown>;
}
```

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
| `spot_place_order` | `POST /api/v5/trade/order` | ✅ |
| `spot_cancel_order` | `POST /api/v5/trade/cancel-order` | ✅ |
| `spot_amend_order` | `POST /api/v5/trade/amend-order` | ✅ |
| `spot_get_orders` | `GET /api/v5/trade/orders-pending` or `orders-history` | ❌ |
| `spot_get_fills` | `GET /api/v5/trade/fills` | ❌ |

### swap module (credentials required)

| Tool | API Endpoint | Write |
|------|-------------|-------|
| `swap_place_order` | `POST /api/v5/trade/order` | ✅ |
| `swap_cancel_order` | `POST /api/v5/trade/cancel-order` | ✅ |
| `swap_get_orders` | `GET /api/v5/trade/orders-pending` or `orders-history` | ❌ |
| `swap_get_positions` | `GET /api/v5/account/positions` | ❌ |
| `swap_set_leverage` | `POST /api/v5/account/set-leverage` | ✅ |
| `swap_get_fills` | `GET /api/v5/trade/fills` | ❌ |
| `move_order_stop` | `POST /api/v5/trade/order-algo` | ✅ |

### account module (credentials required)

| Tool | API Endpoint | Write |
|------|-------------|-------|
| `account_get_balance` | `GET /api/v5/account/balance` | ❌ |
| `account_transfer` | `POST /api/v5/asset/transfer` | ✅ |

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

```toml
default_profile = "demo"

[profiles.live]
api_key    = "..."
secret_key = "..."
passphrase = "..."

[profiles.demo]
api_key    = "..."
secret_key = "..."
passphrase = "..."
demo       = true
```

### CLI Flags

```
okx-trade-mcp [options]

  --modules <list>   Comma-separated module names, or "all" (default: spot,swap,account)
  --read-only        Disable all write operations
  --demo             Enable demo trading (inject x-simulated-trading: 1)
  --help
  --version
```

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

Failed tool call response format:
```json
{
  "tool": "spot_place_order",
  "error": true,
  "type": "OkxApiError",
  "code": "51008",
  "message": "Order amount exceeded",
  "endpoint": "POST /api/v5/trade/order",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 8. Claude Desktop Configuration Examples

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

**Standard (npx — always latest version):**
```json
{
  "mcpServers": {
    "okx": {
      "command": "npx",
      "args": ["-y", "okx-trade-mcp"],
      "env": {
        "OKX_API_KEY": "your-api-key",
        "OKX_SECRET_KEY": "your-secret-key",
        "OKX_PASSPHRASE": "your-passphrase"
      }
    }
  }
}
```

**Demo trading:**
```json
{
  "mcpServers": {
    "okx-demo": {
      "command": "npx",
      "args": ["-y", "okx-trade-mcp", "--demo"],
      "env": {
        "OKX_API_KEY": "your-demo-api-key",
        "OKX_SECRET_KEY": "your-demo-secret-key",
        "OKX_PASSPHRASE": "your-demo-passphrase"
      }
    }
  }
}
```

**Read-only market data (no credentials required):**
```json
{
  "mcpServers": {
    "okx-readonly": {
      "command": "npx",
      "args": ["-y", "okx-trade-mcp", "--modules", "market", "--read-only"]
    }
  }
}
```

---

## 9. Key Differences from Other Exchanges

| Aspect | Bitget (`agent_hub`) | OKX (`okx-hub`) |
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

```bash
# Install dependencies
pnpm install

# Type check
pnpm typecheck

# Build all packages
pnpm build

# Run unit tests (no credentials required)
pnpm test:unit

# Run directly (development)
node packages/mcp/dist/index.js --help
node packages/mcp/dist/index.js --modules market   # no key needed for market data
node packages/mcp/dist/index.js --demo             # demo trading mode
```

### Adding a New Tool

1. Add a new `ToolSpec` object to the appropriate `packages/core/src/tools/*.ts` file
2. Set `module` to the corresponding module ID and `isWrite` appropriately
3. Define parameters in `inputSchema` (standard JSON Schema)
4. Call `context.client.privateGet/Post` or `publicGet` in the `handler`
5. No changes needed to `server.ts` or `index.ts`

### Adding a New Module

1. Add the new module ID to the `MODULES` array in `packages/core/src/constants.ts`
2. Create `packages/core/src/tools/new-module.ts` and implement `registerNewModuleTools()`
3. Import and call it in `packages/core/src/tools/index.ts` inside `allToolSpecs()`
