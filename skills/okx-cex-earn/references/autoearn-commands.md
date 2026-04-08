# AutoEarn (自动赚币) Command Reference

## earn auto-earn status

Query currencies that support auto-earn and their current status.

```bash
okx --profile live earn auto-earn status              # all currencies
okx --profile live earn auto-earn status USDT          # specific currency
okx --profile live earn auto-earn status --ccy USDT    # --ccy flag form
okx --profile live earn auto-earn status --json
```

Output fields: `ccy` · `earnType` (lend+stake or USDG earn) · `autoLend` (status) · `autoStaking` (status) · `invested` (amount in earn) · `matched` (matched amount) · `apr` (annual rate)

---

## earn auto-earn on

Enable auto-earn for a currency. CLI auto-infers earnType — no manual input needed.

```bash
okx --profile live earn auto-earn on USDT
okx --profile live earn auto-earn on --ccy USDT
okx --profile live earn auto-earn on USDG
```

| Parameter | Required | Description |
|---|---|---|
| `CCY` (positional) or `--ccy` | Yes | Currency, e.g. USDT, SOL, USDG |

**Pre-execution checklist:**
1. `okx --profile live earn auto-earn status <ccy> --json` — verify currency supports auto-earn and is not already enabled
2. Show confirmation summary (see [Confirmation Templates](#confirmation-templates))
3. **Warn about 24h restriction** — once enabled, cannot disable for 24 hours
4. Wait for user confirmation

---

## earn auto-earn off

Disable auto-earn for a currency. **Will fail if enabled less than 24 hours ago.**

```bash
okx --profile live earn auto-earn off USDT
okx --profile live earn auto-earn off --ccy USDT
```

| Parameter | Required | Description |
|---|---|---|
| `CCY` (positional) or `--ccy` | Yes | Currency to disable |

**Pre-execution checklist:**
1. `okx --profile live earn auto-earn status <ccy> --json` — verify auto-earn is currently enabled
2. Show confirmation summary
3. Mention 24h restriction — if user just recently enabled, the operation may fail
4. Wait for user confirmation

**On 24h restriction error:** Parse the error message for the unlock timestamp. Tell the user when they can retry.

---

## earnType Inference Rules

The CLI auto-infers earnType. When using the MCP tool `earn_auto_set` directly, the caller must determine earnType:

1. Call `account_get_balance` for the currency
2. Check `autoLendStatus` and `autoStakingStatus` in the balance details:
   - Currency is USDG or BUIDL → `earnType = "1"` (USDG earn)
   - Otherwise, either is NOT `"unsupported"` → `earnType = "0"` (auto-lend+stake)
   - Neither condition met → currency does not support auto-earn

**Invested amount field difference:**
- `earnType = "0"` (normal currencies): read `autoLendAmt` field
- `earnType = "1"` (USDG/BUIDL): read `eq` (equity) field

---

## MCP Tool Reference

| CLI Command | MCP Tool | Parameters |
|---|---|---|
| `earn auto-earn status` | `account_get_balance` | `ccy` (optional) — filter by `autoLendStatus`/`autoStakingStatus` |
| `earn auto-earn on <CCY>` | `earn_auto_set` | `ccy`, `action: "turn_on"`, `earnType` |
| `earn auto-earn off <CCY>` | `earn_auto_set` | `ccy`, `action: "turn_off"`, `earnType` |

---

## Confirmation Templates

Respond in the user's language. Below are the required data points — adapt phrasing to match the conversation language.

### Enable auto-earn

Present before executing `earn auto-earn on`:

- **Currency**: {ccy}
- **Type**: {earnTypeLabel} (auto-lend+stake / USDG earn)
- **Effect**: idle {ccy} will automatically participate in lending/staking
- **⚠️ 24h lock**: cannot disable within 24 hours of enabling

Wait for explicit confirmation.

### Disable auto-earn

Present before executing `earn auto-earn off`:

- **Currency**: {ccy}
- **Type**: {earnTypeLabel}
- **⚠️ 24h restriction**: if enabled less than 24 hours ago, this will fail

Wait for explicit confirmation.
