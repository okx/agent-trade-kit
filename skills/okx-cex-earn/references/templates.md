# Templates & Reference

> All templates below are examples. Translate column names, labels, and notes to the user's language before rendering.

## DCD Product Table Template

```
{baseCcy} current price: ${spotPrice}
Available balance: {balance} {ccy}

Found the following {CALL/PUT} Dual Investment products:

| # | Product | Target Price | vs Spot | Ref APR | Term | Expiry | Min. Size |
|---|---------|-------------|---------|---------|------|--------|-----------|
| 1 | BTC-USDT-260319-72000-C | $72,000 | ↑3.63% | 26.4% | 7d | Mar 19 | 0.001 BTC |
| 2 | BTC-USDT-260319-73000-C | $73,000 | ↑5.08% | 8.3% | 7d | Mar 19 | 0.001 BTC |

Notes:
- Target price closer to spot → higher trigger probability, higher ref APR
- Target price further from spot → lower trigger probability, lower ref APR
- Yield is locked at subscription time regardless of trigger outcome
- APR shown is indicative; actual yield is locked at quote execution and may vary before final confirmation
```

---

## DCD Order List Template

```
| # | Order ID | Product | Term | Invested | Ref APR | Yield | Settlement Amt | Status |
|---|----------|---------|------|---------|---------|-------|---------------|--------|
| 1 | 123 | BTC-USDT-260320-72000-C | 8d | 0.001 BTC | 83.4% | — | — | Active |
```

- Status: always translate using state table in `dcd-commands.md` — never show raw enum
- Settlement amount: show `—` if not yet settled

---

## Formatting Reference

- **Numbers:** Full precision with currency unit — e.g. `1,234.567890 USDT`
- **Rates:** As percentage — e.g. `1.16%`
- **Timestamps:** All `ts` fields are Unix ms (UTC). Convert to user's timezone before displaying. If unknown, default to UTC+8 and note it. Format: `YYYY/M/D HH:MM` (e.g. `2026/3/11 14:30`)
- **Response structure:** Conclusion → Evidence → Recommended action
- **Rate limits:** Public endpoints are not rate-limited under normal use. Authenticated endpoints follow standard OKX API limits.
