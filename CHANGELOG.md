# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2025-xx-xx

### Added

- **Trailing stop order** (`move_order_stop`) for SWAP — available in both the CLI (`okx-trade-cli`) and MCP server (`okx-trade-mcp`)
- **Update notifier** — on startup, a notice is printed to `stderr` when a newer npm version of the package is available, prompting the user to upgrade

---

## [1.0.0] - 2025-xx-xx

### Added

- **MCP server** (`okx-trade-mcp`): full integration with OKX REST API v5 via the Model Context Protocol, enabling AI agents (Claude Desktop, Cursor, etc.) to trade directly
- **CLI** (`okx-trade-cli`): complete command-line trading interface for OKX, supporting all modules
- **Modules**:
  - `market` — public ticker, order book, and candlestick data (no credentials required)
  - `spot` — spot order placement, cancellation, amendment, order history, and fills
  - `swap` — perpetual/futures order management, positions, leverage, and fills
  - `account` — balance query and fund transfer
- **Algo orders**: conditional orders and OCO (take-profit / stop-loss) order pairs
- **CLI flags**:
  - `--modules <list>` — enable only the specified modules (default: `spot,swap,account`)
  - `--read-only` — disable all write operations
  - `--demo` — route all requests through OKX Demo Trading (injects `x-simulated-trading: 1`)
- **Rate limiter** — client-side token bucket rate limiter applied per tool, preventing accidental API bans
- **Configuration**: TOML-based profile system at `~/.okx/config.toml` supporting live and demo profiles
- **Error hierarchy**: structured error types (`ConfigError`, `ValidationError`, `AuthenticationError`, `RateLimitError`, `OkxApiError`, `NetworkError`) with serialization to MCP tool error payloads

---

*Dates marked `xx-xx` are to be filled in upon release.*
