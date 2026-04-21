# Smart Money Workflows

## 1. Recommend Top Traders

> User: "推荐聪明钱" / "推荐带单员" / "top performers this month"

```bash
okx --profile live smartmoney traders --period 30 --sortType pnl --limit 10 --json
```

Present as Markdown table with: rank, nickName, pnl, pnlRatio, winRatio, asset.

Highlight:
- Highest absolute PnL
- Best return ratio (pnlRatio)
- Best risk-adjusted (high winRatio + low maxRetreat)

---

## 2. Drill Down into a Trader

> User: "看看这个交易员的详情" / "show me trader X"

```bash
okx --profile live smartmoney trader --authorId <id> --json
```

Present profile summary, then current positions table, then recent trades table.

---

## 3. Search for a Specific Trader

> User: "搜索交易员 XXX"

```bash
okx --profile live smartmoney traders --authorIds <id1>,<id2> --json
```

If user provides nickName instead of authorId, search is not supported by API — inform user they need the authorId.

---

## 4. Filter Traders by Criteria

> User: "找胜率80%以上的交易员" / "traders with > 80% win rate"

```bash
okx --profile live smartmoney traders --winRatio 0.8 --period 30 --sortType pnl --limit 10 --json
```

> User: "回撤低于10%的" / "max drawdown under 10%"

```bash
okx --profile live smartmoney traders --maxRetreat 0.1 --period 30 --limit 10 --json
```

---

## 5. Smart Money Signal for a Currency

> User: "BTC 聪明钱信号" / "smart money consensus on ETH"

```bash
# Use --ts with current timestamp in ms
ts=$(date +%s)000

okx --profile live smartmoney signal --ts $ts --instCcy BTC --json
```

Present signal summary (all fields are flat in `data[0]`):
- Long/short ratio: `longRatio`, `weightedLongRatio`, `longTraders`, `shortTraders`
- Win rates: `avgLongWinRatio`, `avgShortWinRatio`
- Trend deltas: `vs1h`, `vs24h`, `vs7d`
- Entry prices: `smartMoneyLongAvgEntry`, `smartMoneyShortAvgEntry`
- Capital: `longNotionalUsdt`, `shortNotionalUsdt`, `netNotionalUsdt`, `totalNotionalVs24h`
- Market context (reserved): `currentPrice`, `priceChange24h`, `fundingRate`, `openInterest`, `longShortAccountRatio`

---

## 6. Multi-Currency Overview

> User: "聪明钱总览" / "smart money overview"

```bash
ts=$(date +%s)000
okx --profile live smartmoney overview --ts $ts --json
```

Present top currencies by smart money activity. Table columns: instId, tradersWithPosition, longRatio, weightedLongRatio, netNotionalUsdt, vs24h.

---

## 7. Signal Trend Analysis

> User: "BTC 信号趋势" / "how has the BTC signal changed?"

```bash
ts=$(date +%s)000
okx --profile live smartmoney signal-history --instId BTC-USDT-SWAP --ts $ts --granularity 1d --json
```

Present as time series table showing: ts, longRatio, weightedLongRatio, tradersWithPosition, netNotionalUsdt, totalNotionalUsdt, tradersQualified.

---

## 8. Cross-Skill: Smart Money + Market Context

> User: "聪明钱看多BTC吗？" / "are smart money traders bullish on BTC?"

```bash
# Parallel execution:
# 1. Smart money signal (already includes marketContext)
okx --profile live smartmoney signal --ts $(date +%s)000 --instCcy BTC --json

# 2. Current market price (via okx-cex-market skill, for real-time price)
okx --profile live market ticker BTC-USDT-SWAP --json
```

Combine: compare smart money avg entry vs current price, interpret long/short ratio + trend.

---

## 9. Recommend and Deep Dive

> User: "推荐一个交易员给我看看" / "recommend a trader and show details"

```bash
# Step 1: Get top traders
okx --profile live smartmoney traders --period 30 --sortType pnl --limit 5 --json

# Step 2: Pick best candidate, get full detail
okx --profile live smartmoney trader --authorId <top_trader_id> --json
```
