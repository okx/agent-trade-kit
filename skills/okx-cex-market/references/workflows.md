# Cross-Skill Workflows & MCP Tool Reference

## Cross-Skill Workflows

All market commands are read-only. Decisions and order placement remain with the user.

---

### Price lookup before order placement

```
okx market ticker BTC-USDT                    → last price, 24h range
okx-cex-portfolio: okx account balance USDT   → available funds
okx-cex-trade: okx spot place ...             → user decides px/sz
```

---

### Funding rate analysis for perp positions

```
okx market funding-rate BTC-USDT-SWAP          → current rate + next funding time
okx market funding-rate BTC-USDT-SWAP --history --limit 10  → recent trend
okx-cex-portfolio: okx account positions       → check existing exposure
```

---

### Market data lookup before grid bot setup

```
okx market candles BTC-USDT --bar 4H --limit 50   → recent OHLCV for range estimation
okx market ticker BTC-USDT                         → current price
okx market orderbook BTC-USDT --sz 20              → liquidity check
okx-cex-bot: okx bot grid create ...               → user decides minPx/maxPx
```

---

### Spot vs perp price comparison (premium check)

```
okx market ticker BTC-USDT
okx market ticker BTC-USDT-SWAP
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
```

---

### Non-crypto asset discovery before trading (Metals / Commodities / Forex / Bonds)

```
# Step 1 — discover valid instIds for the asset class
okx market instruments-by-category --instCategory 4   → Metals: find XAUUSDT-USDT-SWAP, XAGUSDT-USDT-SWAP
okx market instruments-by-category --instCategory 5   → Commodities: find OIL-USDT-SWAP, GAS-USDT-SWAP
okx market instruments-by-category --instCategory 6   → Forex: find EURUSDT-USDT-SWAP, GBPUSDT-USDT-SWAP
okx market instruments-by-category --instCategory 7   → Bonds: find US30Y-USDT-SWAP

# Step 2 — verify live price and check trading session is open
okx market ticker XAUUSDT-USDT-SWAP                   → last price, 24h range (state must show active)
okx market orderbook XAUUSDT-USDT-SWAP                → bid/ask spread and liquidity

# Step 3 — get instrument specs for order sizing
okx market instruments --instType SWAP --instId XAUUSDT-USDT-SWAP --json
                                                       → ctVal, minSz, lotSz for quantity conversion

# okx-cex-trade: user places order after confirming market is open
```

> **Important**: non-crypto instruments have trading-hour restrictions. Always confirm `state=live` in the instruments response and a non-zero last price in `ticker` before proceeding to order placement.

---

### Stock token discovery before trading

```
okx market instruments-by-category --instCategory 3            → list instIds and specs (preferred)
okx market ticker TSLA-USDT-SWAP                               → current price and 24h range
okx market instruments --instType SWAP --instId TSLA-USDT-SWAP --json
                                                                → ctVal, minSz, lotSz for sz conversion
```

> `okx market stock-tokens` is deprecated — use `instruments-by-category --instCategory 3` instead.

---

### Option discovery and pricing

```
okx market open-interest --instType OPTION --instId BTC-USD    → find active option instIds
okx market ticker BTC-USD-250328-95000-C                       → option last price and stats
okx market orderbook BTC-USD-250328-95000-C                    → bid/ask spread
```

---

### Multi-indicator trend analysis

Run in parallel — no ordering dependency:

```
okx market indicator ema BTC-USDT --bar 4H --params 5,20       → EMA5 vs EMA20 alignment
okx market indicator macd BTC-USDT --bar 4H                    → MACD histogram + DIF/DEA cross
okx market indicator rsi BTC-USDT --bar 4H --params 14         → RSI overbought/oversold
okx market indicator bb BTC-USDT --bar 4H                      → Bollinger Bands position
okx market indicator supertrend BTC-USDT --bar 4H              → direction signal (buy/sell)
```

---

### BTC macro cycle analysis

Run in parallel — no ordering dependency:

```
okx market indicator ahr999 BTC-USDT        → accumulate / DCA / bubble zone
okx market indicator rainbow BTC-USDT       → Rainbow Chart valuation band
okx market indicator pi-cycle-top BTC-USDT  → 111-day MA vs 350-day MA×2 cross signal
okx market indicator mayer BTC-USDT         → price / 200-day MA ratio
```

---

## MCP Tool Reference

When using MCP tools directly (instead of CLI), the tool names map as follows:

| CLI subcommand | MCP tool name |
|---|---|
| `market ticker` | `market_get_ticker` |
| `market tickers` | `market_get_tickers` |
| `market instruments` | `market_get_instruments` |
| `market orderbook` | `market_get_orderbook` |
| `market candles` | `market_get_candles` |
| `market index-candles` | `market_get_index_candles` |
| `market funding-rate` | `market_get_funding_rate` |
| `market trades` | `market_get_trades` |
| `market mark-price` | `market_get_mark_price` |
| `market index-ticker` | `market_get_index_ticker` |
| `market price-limit` | `market_get_price_limit` |
| `market open-interest` | `market_get_open_interest` |
| `market stock-tokens` | `market_get_stock_tokens` |
| `market instruments-by-category` | `market_get_instruments_by_category` |
| `market indicator` | `market_get_indicator` |
