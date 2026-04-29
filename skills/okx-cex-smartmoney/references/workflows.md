# Smart Money Workflows

## 1. Recommend Top Traders

> User: "推荐聪明钱" / "top performers this month"

```bash
okx --profile live smartmoney top-traders --period 30 --sortBy pnl --limit 10 --json
```

Present as Markdown table with: rank, nickName, pnl, pnlRatio, winRate, asset.

Highlight:
- Highest absolute PnL
- Best return ratio (pnlRatio)
- Best risk-adjusted (high winRate + low maxDrawdown)

---

## 2. Drill Down into a Trader (no composite — fan out in parallel)

> User: "看看这个交易员的详情" / "show me trader X"

The old `smartmoney trader` composite command was removed. Run all three atomic commands in parallel:

```bash
# Run in parallel — three independent endpoints
okx --profile live smartmoney trader-performance --authorIds <id> --json
okx --profile live smartmoney trader-positions --authorId <id> --json
okx --profile live smartmoney trader-order-history --authorId <id> --limit 50 --json
```

Present in three sections: profile summary (from `trader-performance`), then current positions table (from `trader-positions`), then recent orders table (from `trader-order-history`).

For closed-position history (realized PnL trail), add a fourth call:

```bash
okx --profile live smartmoney trader-position-history --authorId <id> --limit 50 --json
```

`trader-order-history` and `trader-position-history` return top-level `pagination: { hasMore, nextAfter }` — pass `nextAfter` as `--after` for the next page.

---

## 3. Verify / Look Up Specific Traders

> User: "搜索交易员 XXX" / "show me stats for these authorIds"

```bash
okx --profile live smartmoney trader-performance --authorIds <id1>,<id2>,<id3> --json
```

If the user provides a nickName instead of an authorId, search-by-name is not supported by the API — inform the user they need the authorId (typically obtained from `top-traders`).

---

## 4. Filter Traders by Criteria

> User: "找胜率80%以上的交易员" / "traders with > 80% win rate"

```bash
okx --profile live smartmoney top-traders --winRate 0.8 --period 30 --sortBy pnl --limit 10 --json
```

> User: "回撤低于10%的" / "max drawdown under 10%"

```bash
okx --profile live smartmoney top-traders --maxDrawdown 0.1 --period 30 --limit 10 --json
```

> Note: leaderboard uses **numeric thresholds** (`--winRate 0.8`, `--maxDrawdown 0.1`). Signal-side endpoints use **enum tiers** (`--winRateTier WR_GE_80`, `--maxDrawdownTier MD_LE_20`). Don't mix them.

---

## 5. Smart Money Signal for a Coin

> User: "BTC 聪明钱信号" / "smart money consensus on ETH"

```bash
# No --ts needed — handler auto-uses current hour
okx --profile live smartmoney signal-by-coin --instId BTC-USDT-SWAP --json
```

Present signal summary (all fields are flat in `data[0]`):
- Long/short ratio: `longRatio`, `weightedLongRatio`, `longTraders`, `shortTraders`
- Win rates: `avgLongWinRate`, `avgShortWinRate`
- Trend deltas: `vs1h`, `vs24h`, `vs7d`
- Entry prices: `smartMoneyLongAvgEntry`, `smartMoneyShortAvgEntry`
- Capital: `longNotionalUsdt`, `shortNotionalUsdt`, `netNotionalUsdt`, `totalNotionalVs24h`

> Older fields `currentPrice` / `priceChange24h` / `fundingRate` / `openInterest` / `longShortAccountRatio` are no longer returned. For real-time market context, fan out to `okx market ticker` in parallel.

---

## 6. Top Coin Signals (most-watched-by-smart-money instruments)

> User: "聪明钱关注哪些币？" / "what are smart money trading right now?"

```bash
okx --profile live smartmoney top-coin-signals --topInstruments 20 --json
```

Returns SWAP-only top-N instruments ranked by smart-money attention. Table columns: instId, tradersWithPosition, longRatio, weightedLongRatio, netNotionalUsdt, vs24h.

For a historical snapshot:

```bash
okx --profile live smartmoney top-coin-signals --ts 1745844000000 --json
```

For multi-coin scenarios (the old `--instCcyList` mode is gone), fan out individual `signal-by-coin` calls instead:

```bash
# Parallel
okx --profile live smartmoney signal-by-coin --instId BTC-USDT-SWAP --json
okx --profile live smartmoney signal-by-coin --instId ETH-USDT-SWAP --json
okx --profile live smartmoney signal-by-coin --instId SOL-USDT-SWAP --json
```

---

## 7. Signal Trend Analysis (single coin over time)

> User: "BTC 信号趋势" / "how has the BTC signal changed?"

```bash
ts=$(date +%s)000
okx --profile live smartmoney signal-history-by-coin --instId BTC-USDT-SWAP --ts $ts --granularity 1d --limit 30 --json
```

Present as time-series table: ts, longRatio, weightedLongRatio, tradersWithPosition, netNotionalUsdt, totalNotionalUsdt, tradersQualified.

For an authorIds-scoped trend (only those traders' consensus over time):

```bash
okx --profile live smartmoney signal-history-by-traders --instId BTC-USDT-SWAP --authorIds <id1>,<id2> --ts $ts --granularity 1d --json
```

---

## 8. Cross-Skill: Smart Money + Market Context

> User: "聪明钱看多BTC吗？" / "are smart money traders bullish on BTC?"

```bash
# Run in parallel:

# 1. Smart money signal (current hour, auto-filled)
okx --profile live smartmoney signal-by-coin --instId BTC-USDT-SWAP --json

# 2. Current market price (via okx-cex-market skill)
okx --profile live market ticker BTC-USDT-SWAP --json
```

Combine: compare `smartMoneyLongAvgEntry` / `smartMoneyShortAvgEntry` vs current price; interpret `longRatio` + `vs24h` / `vs7d` deltas.

---

## 9. Recommend and Deep Dive

> User: "推荐一个交易员给我看看" / "recommend a trader and show details"

```bash
# Step 1: Get top traders
okx --profile live smartmoney top-traders --period 30 --sortBy pnl --limit 5 --json

# Step 2: Pick best candidate, fan out the three atomic commands in parallel
okx --profile live smartmoney trader-performance --authorIds <top_trader_id> --json
okx --profile live smartmoney trader-positions --authorId <top_trader_id> --json
okx --profile live smartmoney trader-order-history --authorId <top_trader_id> --limit 50 --json
```

---

## 10. Audit a Trader's Realized PnL Pattern

> User: "这个交易员历史平仓的胜率/盈亏曲线" / "show this trader's closed-position track record"

```bash
# Page 1: most recent 50 closed positions
okx --profile live smartmoney trader-position-history --authorId <id> --limit 50 --json

# If pagination.hasMore=true, page 2 uses pagination.nextAfter as --after:
okx --profile live smartmoney trader-position-history --authorId <id> --limit 50 --after <posId> --json
```

Aggregate over `realizedPnl` / `pnlRatio` / `closeType` to characterize the trader (e.g. "8/10 winning closes, 1 liquidation, median ratio +12%"). Useful for risk assessment beyond the snapshot stats in `top-traders`.

---

## 11. Trade History for One Symbol

> User: "trader X 的 BTC 成交记录"

```bash
okx --profile live smartmoney trader-order-history --authorId <id> --instId BTC-USDT-SWAP --limit 50 --json
```

Present as time-ordered table: `cTime`, `instId`, `side`, `posSide`, `ordType`, `avgPx`, `sz`, `value`. For deeper history, paginate via `pagination.nextAfter` (last `ordId`).
