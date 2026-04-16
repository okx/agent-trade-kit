<!-- triggers: market, ticker, candle, orderbook, indicator, account, balance, transfer, position, asset, audit, history, bills, ta, technical analysis -->
# Market Data, Account & Audit Modules

## Market Module (`packages/core/src/tools/market.ts`)

The market module exposes **public** OKX endpoints — no API credentials required. It is safe to call from read-only or unauthenticated contexts.

Key capabilities:
- **Tickers**: real-time bid/ask/last price for any instrument (`market_get_ticker`, `market_list_tickers`)
- **Candlestick data**: OHLCV bars with configurable bar size (`1m`, `5m`, `1H`, `1D`, etc.) — `market_get_candles`, `market_get_history_candles`
- **Order book**: full or depth-limited L2 order book snapshot (`market_get_orderbook`)
- **Recent trades**: latest executed trades for an instrument (`market_get_trades`)
- **Instrument info**: contract value, lot size, tick size, min size — `market_get_instrument`
- **Mark/index price**: funding rate, mark price, index price for derivatives

All market tools are tagged `isWrite: false` and remain **available** when the `--read-only` flag is set (read-only mode only removes `isWrite: true` tools).

### Market Filter (`market_filter`)

Multi-dimensional instrument screener supporting price, volume, OI, funding rate, and market cap filters with sorting.

**⚠️ SPOT + quoteCcy pitfall**: When `instType=SPOT`, the OKX API returns instruments across **all** quote currencies (USDT, USDC, BTC, ETH, DAI, etc.) in a single response. This mixes heterogeneous instruments and distorts any sort-by ranking (e.g., sorting by `volUsd24h` will interleave BTC-USDT with obscure BTC-DAI pairs). Always pass `quoteCcy=USDT` as the default when querying SPOT, unless the user explicitly requests other quote currencies.

## Indicator Module (`packages/core/src/tools/indicator.ts`)

Built on top of the market candle data, the indicator module computes common technical analysis indicators server-side (no external TA library — computed inline):

- **Moving averages**: SMA, EMA with configurable period
- **RSI**: Relative Strength Index
- **Bollinger Bands**: upper/middle/lower bands with configurable stddev multiplier
- **MACD**: signal line, histogram
- **Volume analysis**: average volume, volume spikes

Indicators fetch candle history internally and return computed values alongside the raw data. The agent can use these to build trading signals without needing a separate TA service.

## Account Module (`packages/core/src/tools/account.ts`)

The account module handles authenticated account state queries and configuration:

- **Balance**: trading account balances by currency (`account_get_balance`)
- **Positions**: open positions with unrealized PnL, margin, liquidation price (`account_get_positions`)
- **Bills/history**: account ledger — realized PnL, fees, funding (`account_get_bills`)
- **Leverage**: current leverage per instrument/margin mode (`account_get_leverage_info`), and `account_set_leverage` to change it
- **Account config**: margin mode (cross/isolated), position mode (one-way/hedge) — `account_get_config`
- **Asset transfer**: move funds between trading/funding/earn accounts (`account_transfer`)
- **Withdrawal**: initiate withdrawal to external wallet (`account_withdraw`)

⚠️ `account_set_leverage`, `account_transfer`, `account_withdraw` are `isWrite: true` — they require write permissions and trigger confirmation flows in the agent.

## Audit Module (`packages/core/src/tools/audit.ts`)

The audit module reads the **local log file** written by the MCP server — it does **not** call any OKX API endpoint.

- **`trade_get_history`**: queries the local audit log at `~/.okx/logs/trade-YYYY-MM-DD.log`. This log records all tool calls made through the MCP server session (timestamp, tool name, parameters, result summary).

This tool is useful for reviewing *what the agent did* in a session (e.g., "what orders did I place today via MCP?"), **not** for querying the full OKX order history from the exchange. To query actual OKX order history from the exchange, use the account module's bills/history tools instead.

## Common Patterns

- **Pagination**: most list tools accept `limit` and `after`/`before` cursor parameters (OKX uses timestamp-based pagination, not page numbers)
- **instId filtering**: most account tools accept an optional `instId` to narrow results to a specific instrument
- **Currency vs instrument**: some account endpoints use `ccy` (e.g., `BTC`) while trading endpoints use `instId` (e.g., `BTC-USDT`) — be careful not to confuse them
