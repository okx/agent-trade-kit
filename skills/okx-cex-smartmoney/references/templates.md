# Templates & Formatting Reference

## Trader Ranking Table Template

| # | Trader | 30d PnL | Return | Win Rate | Max DD | Asset |
|---|--------|---------|--------|----------|--------|-------|
| 1 | {nickName} | ${pnl} | {pnlRatio}% | {winRatio}% | {maxRetreat}% | ${asset} |

## Trader Profile Template

```
=== {nickName} ===
Author ID:    {authorId}
PnL:          ${pnl} ({pnlRatio}%)
Win Rate:     {winRatio}%
Max Drawdown: {maxRetreat}%
Total Asset:  ${asset}
Onboard Days: {onboardDuration}
```

## Position Table Template

| Instrument | Side | Leverage | Entry Price | Current Price | Notional (USD) | PnL |
|------------|------|----------|-------------|---------------|----------------|-----|
| {instId} | {posSide} | {lever}x | {avgPx} | {last} | ${notionalUsd} | {pnl} |

## Trade Record Table Template

| Instrument | Side | Position | Type | Leverage | Price | Avg Fill | Size | Value | Time |
|------------|------|----------|------|----------|-------|----------|------|-------|------|
| {instId} | {side} | {posSide} | {ordType} | {lever}x | {px} | {avgPx} | {sz} | {value} | {cTime} |

## Formatting Reference

- **Numbers:** Full precision with currency unit (e.g. `$519,100.54`)
- **Ratios:** Display as percentage (e.g. `0.8` → `80%`)
- **PnL Ratios:** Display as percentage with sign (e.g. `0.4699` → `+46.99%`)
- **Timestamps:** Unix ms → convert to user timezone, format: `YYYY/M/D HH:MM`
- **Response structure:** Conclusion → Evidence → Recommended action
- **Rate limits:** 5 requests per endpoint per second
