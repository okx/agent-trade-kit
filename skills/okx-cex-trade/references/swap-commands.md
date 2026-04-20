# Swap / Perpetual Command Reference

## Swap — Place Order

```bash
okx swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy|margin>] \
  [--posSide <long|short>] [--px <price>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx=<p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx=<p|-1>] \
  [--clOrdId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument (e.g., `BTC-USDT-SWAP`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--sz` | Yes | - | Order size — unit depends on `--tgtCcy` |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT notional value; `margin`: sz in USDT margin cost (position = sz * leverage) |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--px` | Cond. | - | Price — required for limit orders |
| `--reduceOnly` | No | false | Close-only; will not open a new position if one doesn't exist |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution (must use `=` form: `--tpOrdPx=-1`) |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution (must use `=` form: `--slOrdPx=-1`) |
| `--clOrdId` | No | - | Client-assigned order ID (max 32 chars alphanumeric + `-` `_`) |

---

## Swap — Cancel Order

```bash
okx swap cancel --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

At least one of `--ordId` or `--clOrdId` is required.

---

## Swap — Amend Order

```bash
okx swap amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

---

## Swap — Close Position

```bash
okx swap close --instId <id> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--autoCxl] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--autoCxl` | No | false | Auto-cancel pending orders before closing |

Closes the **entire** position at market price.

---

## Swap — Set Leverage

```bash
okx swap leverage --instId <id> --lever <n> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument |
| `--lever` | Yes | - | Leverage multiplier (e.g., `10`) |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required for isolated mode in hedge mode |

> ⚠ **Stock tokens** (e.g., `TSLA-USDT-SWAP`): maximum leverage is **5x**. The exchange will reject `--lever` values above 5 for stock token instruments.

---

## Swap — Get Leverage

```bash
okx swap get-leverage --instId <id> --mgnMode <cross|isolated> [--json]
```

Returns table: `instId`, `mgnMode`, `posSide`, `lever`.

---

## Swap — Place Algo (TP/SL / Trail)

```bash
okx swap algo place --instId <id> --side <buy|sell> \
  --ordType <oco|conditional|move_order_stop> --sz <n> \
  --tdMode <cross|isolated> \
  [--clOrdId <id>] \
  [--tgtCcy <base_ccy|quote_ccy|margin>] \
  [--posSide <long|short>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx=<p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx=<p|-1>] \
  [--callbackRatio <r>] [--callbackSpread <s>] [--activePx <p>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument (e.g., `BTC-USDT-SWAP`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `oco`, `conditional`, or `move_order_stop` |
| `--sz` | Yes | - | Number of contracts |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--clOrdId` | No | - | Client-assigned algo order ID (max 32 chars alphanumeric + `-` `_`) |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT notional value; `margin`: sz in USDT margin cost (position = sz * leverage) |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--reduceOnly` | No | false | Close-only; will not open a new position if one doesn't exist |
| `--tpTriggerPx` | Cond. | - | Take-profit trigger price |
| `--tpOrdPx` | Cond. | - | TP order price; use `-1` for market execution (must use `=` form: `--tpOrdPx=-1`) |
| `--slTriggerPx` | Cond. | - | Stop-loss trigger price |
| `--slOrdPx` | Cond. | - | SL order price; use `-1` for market execution (must use `=` form: `--slOrdPx=-1`) |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

For `move_order_stop`: provide `--callbackRatio` or `--callbackSpread` (one required).

**Example — TP/SL worth 500 USDT notional on BTC perp (auto-convert to contracts):**
```bash
okx swap algo place --instId BTC-USDT-SWAP --side sell --ordType conditional \
  --sz 500 --tgtCcy quote_ccy --tdMode cross --posSide long \
  --slTriggerPx 60000 --slOrdPx=-1
```

**Example — TP/SL with 500 USDT margin cost (leverage-aware, e.g. 10x → 5000 USDT notional):**
```bash
okx swap algo place --instId BTC-USDT-SWAP --side sell --ordType conditional \
  --sz 500 --tgtCcy margin --tdMode cross --posSide long \
  --slTriggerPx 60000 --slOrdPx=-1
```

---

## Swap — Place Trailing Stop

```bash
okx swap algo trail --instId <id> --side <buy|sell> --sz <n> \
  --tdMode <cross|isolated> \
  [--posSide <long|short>] [--reduceOnly] \
  [--callbackRatio <ratio>] [--callbackSpread <spread>] \
  [--activePx <price>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

---

## Swap — Amend Algo

```bash
okx swap algo amend --instId <id> --algoId <id> \
  [--newSz <n>] [--newTpTriggerPx <p>] [--newTpOrdPx <p>] \
  [--newSlTriggerPx <p>] [--newSlOrdPx <p>] [--json]
```

> **Note**: Use this to modify TP/SL orders attached when placing the main order. Run `okx swap algo orders` first to find the `algoId`.

---

## Swap — Cancel Algo

```bash
okx swap algo cancel --instId <id> --algoId <id> [--json]
```

---

## Swap — List Orders

```bash
okx swap orders [--instId <id>] [--history] [--json]
```

---

## Swap — Get Order

```bash
okx swap get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

Returns: `ordId`, `instId`, `side`, `posSide`, `ordType`, `px`, `sz`, `fillSz`, `avgPx`, `state`, `cTime`.

---

## Swap — Positions

```bash
okx swap positions [<instId>] [--json]
```

Returns: `instId`, `side`, `size`, `avgPx`, `upl`, `uplRatio`, `lever`. Only non-zero positions.

---

## Swap — Fills

```bash
okx swap fills [--instId <id>] [--ordId <id>] [--archive] [--json]
```

`--archive`: access older fills beyond the default window.

---

## Swap — Algo Orders

```bash
okx swap algo orders [--instId <id>] [--history] [--ordType <type>] [--json]
```

---

## Edge Cases — Swap / Perpetual

- **sz unit**: number of contracts (default), USDT notional value (`--tgtCcy quote_ccy`), or USDT margin cost (`--tgtCcy margin`). If the user specifies a USDT amount, clarify whether it is notional value or margin cost, then pass directly as `--sz` with the appropriate `--tgtCcy` — do NOT manually convert to contracts. With `margin` mode, the system queries current leverage and calculates: `contracts = floor(margin * lever / (ctVal * lastPx))`
- **Linear vs inverse**: `BTC-USDT-SWAP` is linear (USDT-margined); `BTC-USD-SWAP` is inverse (BTC-margined). For inverse, warn the user that margin and P&L are settled in BTC
- **posSide**: required in hedge mode (`long_short_mode`); omit in net mode. Check `okx account config` for `posMode`
- **tdMode**: use `cross` for cross-margin, `isolated` for isolated margin
- **Close position**: `swap close` closes the **entire** position; to partial close, use `swap place` with a reduce-only algo
- **Leverage**: max leverage varies by instrument and account level; exchange rejects if exceeded. **If set-leverage fails with "Cancel cross-margin TP/SL … or stop bots"**: this means pending algo orders or active trading bots exist on that instrument under cross margin. Troubleshoot in order: (1) `okx swap algo-orders --instId <id> --status pending` — check for TP/SL, trailing, trigger, chase orders (most common cause); (2) only if no algo orders found, check bots: `okx bot grid-orders --type contract_grid --status active`. **Never automatically cancel algo orders or stop bots** — show findings to the user and let them decide which to cancel/stop
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both
- **Algo on close side**: always set `--side` opposite to position (e.g., long position → sell algo)
- **Stock tokens (instCategory=3)**: instruments like `TSLA-USDT-SWAP`, `NVDA-USDT-SWAP` follow the same linear SWAP flow (USDT-margined, sz in contracts). Key differences: (1) max leverage **5x** — check with `swap get-leverage` before placing, set with `swap leverage --lever <n≤5>`; (2) `--posSide` is always required; (3) trading restricted to stock market hours (US stocks: Mon–Fri ~09:30–16:00 ET) — confirm live ticker before placing. Use `okx market stock-tokens` to list available instruments
