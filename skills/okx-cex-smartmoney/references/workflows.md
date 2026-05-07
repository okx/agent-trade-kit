# Smart Money Workflows

## 1. Recommend Top Traders

> User: "推荐聪明钱" / "top performers this month"

```bash
okx --profile live smartmoney traders-by-filter --period 30 --sortBy pnl --limit 10 --json
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
okx --profile live smartmoney performance-by-trader --authorIds <id> --json
okx --profile live smartmoney trader-positions --authorId <id> --json
okx --profile live smartmoney trader-orders-history --authorId <id> --limit 50 --json
```

Present in three sections: profile summary (from `performance-by-trader`), then current positions table (from `trader-positions`), then recent orders table (from `trader-orders-history`).

For closed-position history (realized PnL trail), add a fourth call:

```bash
okx --profile live smartmoney trader-positions-history --authorId <id> --limit 50 --json
```

`trader-orders-history` and `trader-positions-history` return top-level `pagination: { hasMore, nextAfter }` — pass `nextAfter` as `--after` for the next page.

---

## 3. Verify / Look Up Specific Traders

> User: "show me stats for these authorIds" / "verify trader 1001,1002"

```bash
okx --profile live smartmoney performance-by-trader --authorIds <id1>,<id2>,<id3> --json
```

If the user provides a **nickName** (e.g. "alice", "小明") instead of an authorId, resolve it first via `search-trader` and then feed the resulting authorId(s) into the other tools:

```bash
# Step 1: resolve nickname → up to 10 candidate Top Traders
okx --profile live smartmoney search-trader --keyword alice --json

# Step 2: take the chosen authorId from the result and look up performance / positions etc.
okx --profile live smartmoney performance-by-trader --authorIds <authorId> --json
```

> `search-trader` returns at most 10 matches sorted by OKX-platform follower count DESC, restricted to the Top Trader set. An empty array means no profitable leaderboard trader matched the keyword.

---

## 4. Filter Traders by Criteria

> User: "找胜率80%以上的交易员" / "traders with > 80% win rate"

```bash
okx --profile live smartmoney traders-by-filter --minWinRate 0.8 --period 30 --sortBy pnl --limit 10 --json
```

> User: "回撤低于10%的" / "max drawdown under 10%"

```bash
okx --profile live smartmoney traders-by-filter --maxDrawdown 0.1 --period 30 --limit 10 --json
```

> Note: leaderboard uses **numeric thresholds** with `min*` / `max*` prefix (`--minPnl 10000`, `--minWinRate 0.8`, `--maxDrawdown 0.1`, `--minAum 1000`). Signal-side endpoints use **enum tiers** with `*Tier` suffix (`--pnlTier PNL_TOP20`, `--winRateTier WR_GE_80`, `--maxDrawdownTier MR_LE_20`, `--aumTier AUM_TOP20`). The two surfaces have disjoint flag names by design — passing leaderboard names to signal endpoints (or vice versa) silently no-ops.

---

## 5. Smart Money Signal for a Coin

> User: "BTC 聪明钱信号" / "smart money consensus on ETH"

```bash
# No --ts needed — handler auto-uses current hour
okx --profile live smartmoney signal-overview-by-filter --instCcyList BTC --json
```

Present signal summary (each `data[]` item has outer fields + 3 nested groups: `notional`, `longShortRatio`, `winRate`):
- Outer: `ccy`, `dataVersion`, `tradersWithPosition`, `tradersQualified`, `longTraders`, `shortTraders`
- Long/short ratio (under `longShortRatio`): `longRatio`, `shortRatio`, `weightedLongRatio`, `weightedShortRatio`
- Trend deltas (under `longShortRatio`): `longRatioVs1h`, `longRatioVs24h`, `longRatioVs7d`
- Capital (under `notional`): `longNotionalUsdt`, `shortNotionalUsdt`, `netNotionalUsdt`, `totalNotionalUsdt`, `totalNotionalVs24h`
- Entry prices (under `notional`): `smartMoneyLongAvgEntry`, `smartMoneyShortAvgEntry`
- Win rates (under `winRate`): `avgLongWinRate`, `avgShortWinRate`

> **Notional pricing**: All `notional.*` fields and `weightedLongRatio` / `weightedShortRatio` are weighted by each trader's **entry price (`price_avg`)**, NOT mark price. They move only when positions are scaled (open / close / add) and stay constant across hourly buckets when traders hold positions unchanged. For real-time price comparison, compare `notional.smartMoneyLongAvgEntry` / `smartMoneyShortAvgEntry` against `okx market ticker` in parallel.

> Older fields `currentPrice` / `priceChange24h` / `fundingRate` / `openInterest` / `longShortAccountRatio` are no longer returned. For real-time market context, fan out to `okx market ticker` in parallel.

---

## 6. Top-N Most-Watched Coins (and multi-coin consensus)

> User: "聪明钱关注哪些币？" / "what are smart money trading right now?" / "BTC ETH SOL 这几个币的共识"

```bash
# Top-N hottest among smart money (default 20)
okx --profile live smartmoney signal-overview-by-filter --topInstruments 20 --json

# Or: specific coin list
okx --profile live smartmoney signal-overview-by-filter --instCcyList BTC,ETH,SOL --json
```

`signal-overview-by-filter` accepts `--topInstruments` OR `--instCcyList` (mutually exclusive). Default is `--topInstruments=20` when neither is given. Snapshot is always the **current hour** — no `--ts` / `--dataVersion`. For a historical comparison call `signal-trend-by-filter` per instrument with the desired `--asOfTime` anchor and `--limit` bucket count.

> **⚠ Linear-only scope**: Aggregations include USDT-margined and USDS-margined instruments only (e.g. `BTC` covers `BTC-USDT-SWAP` + `BTC-USDS-SWAP`). Coin-margined contracts (`BTC-USD-SWAP`, `BTC-USD-DELIVERY`, …) are excluded — a trader's coin-margined exposure is silently dropped from the signal, which can materially understate institutional / coin-margined whales on majors like BTC and ETH. If the user asks why a trader with a known large BTC position does not show up under `--instCcyList BTC`, suspect coin-margined and verify with `trader-positions`.

Table columns to surface: `ccy`, `tradersWithPosition`, `longShortRatio.longRatio`, `longShortRatio.weightedLongRatio`, `notional.netNotionalUsdt`, `longShortRatio.longRatioVs1h` / `longRatioVs24h` / `longRatioVs7d`, `notional.smartMoneyLongAvgEntry`, `notional.smartMoneyShortAvgEntry`, `notional.totalNotionalVs24h`.

---

## 7. Signal Trend Analysis (single coin over time)

> User: "BTC 信号趋势" / "how has the BTC signal changed?"

```bash
# 30 daily buckets ending at the current UTC hour, scoped to BTC
okx --profile live smartmoney signal-trend-by-filter --instCcy BTC --granularity 1d --limit 30 --json

# Or anchor at a specific UTC hour (10-digit yyyyMMddHH)
okx --profile live smartmoney signal-trend-by-filter --instCcy BTC --asOfTime 2026050100 --granularity 1d --limit 30 --json
```

Present as time-series table: dataVersion, ccy, longRatio, shortRatio, weightedLongRatio, weightedShortRatio, longTraders, shortTraders, tradersWithPosition, tradersQualified, netNotionalUsdt, totalNotionalUsdt.

> **Reading the trend**: `weightedLongRatio` / `weightedShortRatio` / `netNotionalUsdt` / `totalNotionalUsdt` are entry-price-weighted (`price_avg`), not mark-price-weighted. A flat trend across buckets means traders held positions unchanged — it does NOT mean underlying price was flat. To detect actual scaling, watch for changes in these values; to gauge price movement, fetch `okx market candles` separately.

For an authorIds-scoped trend (consensus of a hand-picked set of traders; capability tier filters not exposed — `_by_trader` is direct-lookup, backend uses tier defaults; `--sortBy` and `--period` are accepted):

```bash
okx --profile live smartmoney signal-trend-by-trader --authorIds <id1>,<id2> --instCcy BTC --granularity 1d --limit 30 --sortBy pnl --period 7 --json
```

---

## 8. Cross-Skill: Smart Money + Market Context

> User: "聪明钱看多BTC吗？" / "are smart money traders bullish on BTC?"

```bash
# Run in parallel:

# 1. Smart money signal (current hour, auto-filled)
okx --profile live smartmoney signal-overview-by-filter --instCcyList BTC --json

# 2. Current market price (via okx-cex-market skill)
okx --profile live market ticker BTC-USDT-SWAP --json
```

Combine: compare `notional.smartMoneyLongAvgEntry` / `notional.smartMoneyShortAvgEntry` vs current price; interpret `longShortRatio.longRatio` + `longShortRatio.longRatioVs24h` / `longRatioVs7d` deltas.

---

## 9. Recommend and Deep Dive

> User: "推荐一个交易员给我看看" / "recommend a trader and show details"

```bash
# Step 1: Get top traders
okx --profile live smartmoney traders-by-filter --period 30 --sortBy pnl --limit 5 --json

# Step 2: Pick best candidate, fan out the three atomic commands in parallel
okx --profile live smartmoney performance-by-trader --authorIds <top_trader_id> --json
okx --profile live smartmoney trader-positions --authorId <top_trader_id> --json
okx --profile live smartmoney trader-orders-history --authorId <top_trader_id> --limit 50 --json
```

---

## 10. Audit a Trader's Realized PnL Pattern

> User: "这个交易员历史平仓的胜率/盈亏曲线" / "show this trader's closed-position track record"

```bash
# Page 1: most recent 50 closed positions
okx --profile live smartmoney trader-positions-history --authorId <id> --limit 50 --json

# If pagination.hasMore=true, page 2 uses pagination.nextAfter as --after:
okx --profile live smartmoney trader-positions-history --authorId <id> --limit 50 --after <posId> --json
```

Aggregate over `realizedPnl` / `pnlRatio` / `closeType` to characterize the trader (e.g. "8/10 winning closes, 1 liquidation, median ratio +12%"). Useful for risk assessment beyond the snapshot stats in `traders-by-filter`.

---

## 11. Trade History for One Symbol

> User: "trader X 的 BTC 成交记录"

```bash
okx --profile live smartmoney trader-orders-history --authorId <id> --instId BTC-USDT-SWAP --limit 50 --json
```

Present as time-ordered table: `cTime`, `instId`, `side`, `posSide`, `ordType`, `avgPx`, `sz`, `value`. For deeper history, paginate via `pagination.nextAfter` (last `ordId`).
