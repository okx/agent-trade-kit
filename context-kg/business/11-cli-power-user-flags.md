# Phase 3a+c CLI Power-User Flags

> **For human reviewers only — not agent runtime.**
> These flags exist in the CLI layer only. They are intentionally absent from MCP
> `inputSchema.properties` and from skill workflows to limit autonomous agent use.
> See issue #182 and the Phase 3a+c MR for rationale.

## Flags Added (issue #182)

### Ratio-based TP/SL triggers

| Flag | Type | Applies to |
|------|------|-----------|
| `--tpTriggerRatio` | string (decimal, e.g. "0.3" = 30%) | algo place: swap/spot/futures — conditional/oco/trigger |
| `--slTriggerRatio` | string (decimal, e.g. "0.05" = 5%) | algo place: swap/spot/futures — conditional/oco/trigger |

These specify TP/SL as a percentage distance from the entry price rather than an absolute price.
For `conditional`/`oco` ordTypes they are passed as top-level fields.
For `trigger` ordType they are passed inside `attachAlgoOrds`.

### Partial-position close

| Flag | Type | Applies to |
|------|------|-----------|
| `--closeFraction` | string (decimal, e.g. "0.5" = 50%) | algo place: swap/spot/futures — conditional/oco |

Mutually exclusive with `--sz` per OKX API specification. OKX server enforces this constraint
(returns error code 51000 on conflict). No CLI-side validation — same convention as ordType-specific
required fields in Phase 2.

### SPOT quote currency selection

| Flag | Type | Applies to |
|------|------|-----------|
| `--tradeQuoteCcy` | string ("USDT" \| "USDC" \| "BTC") | spot place only |

Selects which quote currency the SPOT order uses for execution. Useful when the instrument
has multiple quote currencies available (e.g. BTC/USDT vs BTC/USDC).

### SPOT auto-amend disable

| Flag | Type | Applies to |
|------|------|-----------|
| `--banAmend` | boolean flag | spot place only |

When set, disables OKX's automatic quantity amendment for SPOT market orders.
OKX normally auto-corrects market order size when it would exceed available balance;
`--banAmend` forces the order to be rejected instead.

### Price auto-correction disable

| Flag | Type | Applies to |
|------|------|-----------|
| `--pxAmendType` | string ("0" \| "1") | place + algo place: swap/spot/futures |

Controls OKX's automatic price correction for out-of-range limit orders:
- `"0"` (default): allow OKX to auto-correct the price within the allowed band
- `"1"`: reject the order if the price is outside the allowed band

## Dual-Tier Design Rationale

These flags are CLI-only by TL decision (2026-04-25). Reasons:

1. **High mis-use risk for autonomous agents**: ratio triggers may be applied where absolute
   prices are more reliable; `--banAmend` disables OKX's protective auto-correction.
2. **Power-user intent**: users reaching for `okx swap algo place --tpTriggerRatio 0.3`
   already know what they want. Agents should not discover or apply these autonomously.
3. **Skill complexity**: exposing these via skill would increase the agent decision surface
   non-linearly without proportional benefit.

## Discovery

Users discover these flags via `okx swap algo place --help` (and equivalent for spot/futures).
They are documented in the `usage:` strings in `cli-registry.ts` under the `power-user (CLI-only)`
annotation.
