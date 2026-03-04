# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Audit log — `trade_get_history`**: query the local NDJSON audit log of all MCP tool calls; supports `limit`, `tool`, `level`, and `since` filters
- **Audit logging**: MCP server automatically writes NDJSON entries to `~/.okx/logs/trade-YYYY-MM-DD.log`; `--no-log` disables logging, `--log-level` sets the minimum level (default `info`); sensitive fields (apiKey, secretKey, passphrase) are automatically redacted

- **Error tracing**: `traceId` field added to `ToolErrorPayload` and all error classes — populated from `x-trace-id` / `x-request-id` response headers when OKX returns them
- **Server version in MCP errors**: `serverVersion` injected into MCP error payloads for easier bug reporting
- **CLI version in errors**: `Version: okx-trade-cli@x.x.x` always printed to stderr on error; `TraceId:` printed when available
- **Market — index data**: `market_get_index_ticker`, `market_get_index_candles` (+ history), `market_get_price_limit` (3 new tools)
- **Spot — batch orders**: `spot_batch_orders` — batch place/cancel/amend up to 20 spot orders in one request
- **Spot/Swap — order archive**: `status="archive"` on `spot_get_orders` / `swap_get_orders` → `/trade/orders-history-archive` (up to 3 months)
- **Account — positions**: `account_get_positions` — cross-instType positions query (MARGIN/SWAP/FUTURES/OPTION)
- **Account — bills archive**: `account_get_bills_archive` — archived ledger up to 3 months
- **Account — sizing**: `account_get_max_withdrawal`, `account_get_max_avail_size`
- **README**: "Reporting Issues / 报错反馈" section with example error payloads
- **Grid Bot (module: `bot`)**: 5 new tools for OKX Trading Bot grid strategies — `grid_get_orders`, `grid_get_order_details`, `grid_get_sub_orders` (read), `grid_create_order`, `grid_stop_order` (write). Covers Spot Grid, Contract Grid, and Moon Grid.
- **CLI `--demo` flag**: global `--demo` option to enable simulated trading mode directly from the command line (alternative to `OKX_DEMO=1` env var or profile config)
- **CLI bot grid commands**: `bot grid orders`, `bot grid details`, `bot grid sub-orders`, `bot grid create`, `bot grid stop` — full grid bot lifecycle management via CLI
- **CLI full coverage**: extended `okx-trade-cli` to cover all 57 MCP tools — new commands across `market` (`instruments`, `funding-rate`, `mark-price`, `trades`, `index-ticker`, `index-candles`, `price-limit`, `open-interest`), `account` (`positions`, `bills`, `fees`, `config`, `set-position-mode`, `max-size`, `max-avail-size`, `max-withdrawal`, `positions-history`, `asset-balance`, `transfer`), `spot` (`get`, `amend`), `swap` (`get`, `fills`, `close`, `get-leverage`), and new `futures` module (`orders`, `positions`, `fills`, `place`, `cancel`, `get`)

### Fixed

- **Grid bot endpoint paths**: corrected all 5 grid tool endpoints to match OKX API v5 spec — `orders-algo-pending`, `orders-algo-history`, `order-algo`, `stop-order-algo` (previously used wrong paths causing HTTP 404)
- **`grid_stop_order`**: request body now serialized as an array `[{...}]` as required by OKX `stop-order-algo` endpoint
- **`grid_create_order`**: removed spurious `tdMode` parameter (field does not exist in `ApiPlaceGridParam`; was silently ignored by server but polluted the tool schema)
- **`grid_create_order`**: restricted `algoOrdType` enum to `["grid", "contract_grid"]` — server `@StringMatch` validation only accepts these two values for creation; `moon_grid` is valid for queries and stop operations only
- **`grid_stop_order`**: expanded `stopType` enum from `["1","2"]` to `["1","2","3","5","6"]` to match server `StopStrategyParam` validation
- **CLI `bot grid create`**: removed `--tdMode` flag and `algoOrdType` now restricted to `<grid|contract_grid>`, in sync with MCP tool changes
- **CLI `bot grid stop`**: updated `--stopType` hint to `<1|2|3|5|6>`
- **`spot_get_algo_orders`**: fixed `400 Parameter ordType error` when called without an `ordType` filter — now fetches `conditional` and `oco` types in parallel and merges results, matching the behaviour of `swap_get_algo_orders`

### Changed

- Total tools: 48 → 57 → 67
- **Documentation restructure**: split single `README.md` into `README.md` (EN) + `README.zh.md` (ZH) with language toggle; added `docs/configuration.md` (all client setups + startup scenarios), `docs/faq.md`, `docs/cli-reference.md`, and per-module references under `docs/modules/`
- **GitHub issue templates**: added `bug_report.md` and `feature_request.md` under `.github/ISSUE_TEMPLATE/`
- **`SECURITY.md`**: added supported versions table and GitHub Private Security Advisory link
- **Error handling — actionable suggestions**: `OkxRestClient` now maps ~20 OKX error codes to retry guidance; rate-limit codes (`50011`, `50061`) throw `RateLimitError`; server-busy codes carry "Retry after X seconds"; region/compliance and account-issue codes carry "Do not retry" advice
- **Test coverage**: function coverage raised from 76.5% → 93.4% (199 → 243 tests); every source file now exceeds 80% function coverage

---

## [1.0.2] - 2026-03-01

### Added

- **Market — 5 new tools**: `market_get_instruments`, `market_get_funding_rate` (+ history), `market_get_mark_price`, `market_get_trades`, `market_get_open_interest`
- **Market — candle history**: `history=true` on `market_get_candles` → `/market/history-candles`
- **Spot/Swap — fills archive**: `archive=true` on `spot_get_fills` / `swap_get_fills` → `/trade/fills-history`
- **Spot/Swap — single order fetch**: `spot_get_order`, `swap_get_order` — fetch by `ordId` / `clOrdId`
- **Swap — close & batch**: `swap_close_position`, `swap_batch_orders` (batch place/cancel/amend up to 20)
- **Swap — leverage query**: `swap_get_leverage`
- **Account — 6 new tools**: `account_get_bills`, `account_get_positions_history`, `account_get_trade_fee`, `account_get_config`, `account_set_position_mode`, `account_get_max_size`
- **Account — funding balance**: `account_get_asset_balance` (funding account, `/asset/balances`)
- **System capabilities tool**: `system_get_capabilities` — machine-readable server capabilities for agent planning
- **MCP client configs**: Claude Code CLI, VS Code, Windsurf, openCxxW setup examples added to README

### Fixed

- Update notifier package names corrected (`okx-trade-mcp`, `okx-trade-cli`)
- CLI typecheck errors resolved (strict `parseArgs` types, `smol-toml` interop)

### Changed

- Total tools: 28 → 43

---

## [1.0.1] - 2026-02-28

### Added

- **Trailing stop order** (`swap_place_move_stop_order`) for SWAP — available in both CLI and MCP server
- **Update notifier** — on startup, prints a notice to stderr when a newer npm version is available

---

## [1.0.0] - 2026-02-28

### Added

- **MCP server** (`okx-trade-mcp`): OKX REST API v5 integration via the Model Context Protocol
- **CLI** (`okx-trade-cli`): command-line trading interface for OKX
- **Modules**:
  - `market` — ticker, orderbook, candles (no credentials required)
  - `spot` — place/cancel/amend orders, algo orders (conditional, OCO), fills, order history
  - `swap` — perpetual order management, positions, leverage, fills, algo orders
  - `account` — balance query, fund transfer
- **Algo orders**: conditional (take-profit / stop-loss) and OCO order pairs for spot and swap
- **CLI flags**: `--modules`, `--read-only`, `--demo`
- **Rate limiter**: client-side token bucket per tool
- **Config**: TOML profile system at `~/.okx/config.toml`
- **Error hierarchy**: `ConfigError`, `ValidationError`, `AuthenticationError`, `RateLimitError`, `OkxApiError`, `NetworkError` with structured MCP error payloads
