# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

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

### Changed

- Total tools: 48 → 51

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
