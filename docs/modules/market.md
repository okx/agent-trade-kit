# market module

Market data tools. **No API key required.**

## Tools

| Tool | Description |
|------|-------------|
| `market_get_ticker` | Single instrument ticker (last price, 24h volume, bid/ask) |
| `market_get_tickers` | All tickers for an instrument type (SPOT / SWAP / FUTURES / OPTION) |
| `market_get_orderbook` | Order book depth |
| `market_get_candles` | Candlestick data (up to 300 recent bars) |
| `market_get_history_candles` | Historical candlestick data (older than 2 days, up to 3 months) |
| `market_get_index_ticker` | Index ticker for an underlying (e.g. BTC-USD) |
| `market_get_index_candles` | Index candlestick data |
| `market_get_price_limit` | Price limit (upper/lower) for a contract |
| `market_get_funding_rate` | Current funding rate for a perpetual contract |
| `market_get_funding_rate_history` | Historical funding rates |
| `market_get_mark_price` | Mark price for derivatives |
| `market_get_open_interest` | Open interest across instruments |
| `market_get_trades` | Recent trade history |

## Example prompts

- "What is the current BTC-USDT price?"
- "Show me the BTC-USDT-SWAP orderbook top 10 levels"
- "Get hourly candles for ETH-USDT for the last 24 hours"
- "What is the funding rate for BTC-USDT-SWAP?"
- "Show open interest for all SWAP instruments"

## Startup (no key needed)

```json
{
  "mcpServers": {
    "okx-market": {
      "command": "okx-trade-mcp",
      "args": ["--modules", "market"]
    }
  }
}
```

## CLI

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 10
okx market candles BTC-USDT --bar 1H --limit 24
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market open-interest --instType SWAP
okx market trades BTC-USDT --limit 20
okx market index-ticker --instId BTC-USD
okx market price-limit BTC-USDT-SWAP
okx market instruments --instType SPOT
```

Supported candle intervals: `1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

---

# market 模块

行情数据工具。**无需 API Key。**

## 工具列表

| 工具 | 说明 |
|------|------|
| `market_get_ticker` | 单币对行情（最新价、24h 量、买一/卖一） |
| `market_get_tickers` | 某类型全部行情（SPOT / SWAP / FUTURES / OPTION） |
| `market_get_orderbook` | 盘口深度 |
| `market_get_candles` | K线（最近 300 根） |
| `market_get_history_candles` | 历史K线（2天前，最多3个月） |
| `market_get_index_ticker` | 指数行情（如 BTC-USD） |
| `market_get_index_candles` | 指数K线 |
| `market_get_price_limit` | 合约涨跌停价 |
| `market_get_funding_rate` | 永续合约当前资金费率 |
| `market_get_funding_rate_history` | 历史资金费率 |
| `market_get_mark_price` | 衍生品标记价格 |
| `market_get_open_interest` | 持仓量 |
| `market_get_trades` | 最新成交记录 |

## 示例提示词

- "BTC-USDT 当前价格是多少？"
- "显示 BTC-USDT-SWAP 盘口前10档"
- "获取 ETH-USDT 最近24小时的1小时K线"
- "BTC-USDT-SWAP 的资金费率是多少？"
- "显示所有 SWAP 的持仓量"

## 启动配置（无需 Key）

```json
{
  "mcpServers": {
    "okx-market": {
      "command": "okx-trade-mcp",
      "args": ["--modules", "market"]
    }
  }
}
```

## CLI

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 10
okx market candles BTC-USDT --bar 1H --limit 24
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market open-interest --instType SWAP
okx market trades BTC-USDT --limit 20
okx market index-ticker --instId BTC-USD
okx market price-limit BTC-USDT-SWAP
okx market instruments --instType SPOT
```

K线周期：`1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`
