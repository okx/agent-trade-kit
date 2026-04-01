# Futures / Delivery Command Reference

## Futures — Place Order

```bash
okx futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--posSide <long|short>] [--px <price>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument (format: `BTC-USDT-<YYMMDD>`, e.g. `BTC-USDT-260328`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--sz` | Yes | - | Order size — unit depends on `--tgtCcy` |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT amount |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--px` | Cond. | - | Price — required for limit orders |
| `--reduceOnly` | No | false | Close-only; will not open a new position |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution |

`--instId` format: `BTC-USDT-<YYMMDD>` (delivery date suffix).

---

## Futures — Cancel Order

```bash
okx futures cancel --instId <id> --ordId <id> [--json]
```

---

## Futures — Amend Order

```bash
okx futures amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

Must provide at least one of `--newSz` or `--newPx`.

---

## Futures — Close Position

```bash
okx futures close --instId <id> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--autoCxl] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument (e.g., `BTC-USDT-260328`) |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--autoCxl` | No | false | Auto-cancel pending orders before closing |

Closes the **entire** position at market price.

---

## Futures — Set Leverage

```bash
okx futures leverage --instId <id> --lever <n> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument |
| `--lever` | Yes | - | Leverage multiplier (e.g., `10`) |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required for isolated mode in hedge mode |

---

## Futures — Get Leverage

```bash
okx futures get-leverage --instId <id> --mgnMode <cross|isolated> [--json]
```

Returns table: `instId`, `mgnMode`, `posSide`, `lever`.

---

## Futures — List Orders

```bash
okx futures orders [--instId <id>] [--status <open|history|archive>] [--json]
```

| `--status` | Effect |
|---|---|
| `open` | Active/pending orders (default) |
| `history` | Recent completed/cancelled |
| `archive` | Older history |

---

## Futures — Positions

```bash
okx futures positions [<instId>] [--json]
```

Returns: `instId`, `side`, `pos`, `avgPx`, `upl`, `lever`.

---

## Futures — Fills

```bash
okx futures fills [--instId <id>] [--ordId <id>] [--archive] [--json]
```

---

## Futures — Get Order

```bash
okx futures get --instId <id> [--ordId <id>] [--json]
```

---

## Futures — Place Algo (TP/SL / Trail)

```bash
okx futures algo place --instId <id> --side <buy|sell> \
  --ordType <oco|conditional|move_order_stop> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--posSide <long|short>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--callbackRatio <r>] [--callbackSpread <s>] [--activePx <p>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument (e.g., `BTC-USDT-<YYMMDD>`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `oco`, `conditional`, or `move_order_stop` |
| `--sz` | Yes | - | Number of contracts |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT amount |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--reduceOnly` | No | false | Close-only; will not open a new position if one doesn't exist |
| `--tpTriggerPx` | Cond. | - | Take-profit trigger price |
| `--tpOrdPx` | Cond. | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | Cond. | - | Stop-loss trigger price |
| `--slOrdPx` | Cond. | - | SL order price; use `-1` for market execution |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

`--instId` format: `BTC-USDT-<YYMMDD>` (e.g., `BTC-USDT-250328`). For `move_order_stop`: provide `--callbackRatio` or `--callbackSpread` (one required).

---

## Futures — Place Trailing Stop

```bash
okx futures algo trail --instId <id> --side <buy|sell> --sz <n> \
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

## Futures — Amend Algo

```bash
okx futures algo amend --instId <id> --algoId <id> \
  [--newSz <n>] [--newTpTriggerPx <p>] [--newTpOrdPx <p>] \
  [--newSlTriggerPx <p>] [--newSlOrdPx <p>] [--json]
```

---

## Futures — Cancel Algo

```bash
okx futures algo cancel --instId <id> --algoId <id> [--json]
```

---

## Futures — Algo Orders

```bash
okx futures algo orders [--instId <id>] [--history] [--ordType <type>] [--json]
```

---

## Edge Cases — Futures / Delivery

- **sz unit**: number of contracts, or a USDT amount when using `--tgtCcy quote_ccy`. If the user specifies a USDT amount, pass it directly as `--sz` with `--tgtCcy quote_ccy` — do NOT manually convert to contracts
- **Linear vs inverse**: `BTC-USDT-<YYMMDD>` is linear; `BTC-USD-<YYMMDD>` is inverse (USD face value, BTC settlement). For inverse, use `--tgtCcy quote_ccy` to specify a USD amount (note: `quote_ccy` = USD, not USDT for inverse instruments); warn the user that margin and P&L are settled in BTC
- **instId format**: delivery futures use date suffix: `BTC-USDT-<YYMMDD>` (e.g., `BTC-USDT-260328` for March 28, 2026 expiry)
- **Expiry**: futures expire on the delivery date — all positions auto-settle; do not hold through expiry unless intended
- **Close position**: use `futures close` to close the **entire** position at market price — same semantics as `swap close`; to partial close, use `futures place` with `--reduceOnly`
- **Leverage**: `futures leverage` sets leverage for a futures instrument, same constraints as swap; max leverage varies by instrument and account level
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both; same parameters as swap — `--tdMode` and `--posSide` required in hedge mode
- **Algo on close side**: always set `--side` opposite to position (e.g., long position → `sell` algo)
