# Futures / Delivery Command Reference

## Naming — CLI vs MCP tool

This CLI uses **space-separated subcommands** (`okx futures algo place`). The MCP tool names surfaced to AI agents use a **single underscored identifier** (`futures_place_algo_order`). They are the same feature on two different surfaces. Mapping examples:

| CLI command | MCP tool name |
|---|---|
| `okx futures place` | `futures_place_order` |
| `okx futures algo place` | `futures_place_algo_order` |
| `okx futures algo trail` | `futures_place_move_stop_order` (deprecated alias) / `futures_place_algo_order` w/ `ordType=move_order_stop` |
| `okx futures cancel` | `futures_cancel_order` |
| `okx futures algo cancel` | `futures_cancel_algo_orders` |
| `okx futures amend` | `futures_amend_order` |
| `okx futures algo amend` | `futures_amend_algo_order` |
| `okx futures close` | `futures_close_position` |
| `okx futures leverage` | `futures_set_leverage` |
| `okx futures get-leverage` | `futures_get_leverage` |
| `okx futures orders` | `futures_get_orders` |
| `okx futures positions` | `futures_get_positions` |
| `okx futures fills` | `futures_get_fills` |
| `okx futures batch` | `futures_batch_orders` |

**Do NOT convert MCP tool names to hyphen-joined CLI commands.** `okx futures place-algo` is **not** a valid command — the CLI will reject it with "Unknown command". Use `okx futures algo place` instead.

## Futures — Place Order

```bash
okx futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy|margin>] \
  [--posSide <long|short>] [--px <price>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx=<p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx=<p|-1>] \
  [--clOrdId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument (format: `BTC-USDT-<YYMMDD>`, e.g. `BTC-USDT-260328`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--sz` | Yes | - | Order size — unit depends on `--tgtCcy` |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT notional value; `margin`: sz in USDT margin cost (position = sz * leverage) |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--px` | Cond. | - | Price — required for limit orders |
| `--reduceOnly` | No | false | Close-only; will not open a new position |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution (must use `=` form: `--tpOrdPx=-1`) |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution (must use `=` form: `--slOrdPx=-1`) |
| `--clOrdId` | No | - | Client-assigned order ID (max 32 chars alphanumeric + `-` `_`) |

`--instId` format: `BTC-USDT-<YYMMDD>` (delivery date suffix).

---

## Futures — Cancel Order

```bash
okx futures cancel --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

At least one of `--ordId` or `--clOrdId` is required.

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
| `--lever` | Yes | - | Positive number, e.g., `10`. Max allowed depends on the instrument (query `okx market instruments`). |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required for `isolated` in hedge (`long_short_mode`) pos mode. Each side must be set **separately** (setting `long` does NOT auto-apply to `short`). Omit for net mode or for `cross`. |

**Not supported**: Portfolio-margin accounts cannot adjust `cross` leverage for FUTURES — OKX always rejects. If unsure of account mode, run `okx account config` first and check `acctLv`.

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
okx futures get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

---

## Futures — Place Algo (TP/SL / Trail)

```bash
okx futures algo place --instId <id> --side <buy|sell> \
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
| `--instId` | Yes | - | Futures instrument (e.g., `BTC-USDT-<YYMMDD>`) |
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

> **Note**: Use this to modify TP/SL orders attached when placing the main order. Run `okx futures algo orders` first to find the `algoId`.

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

- **sz unit**: number of contracts (default), USDT notional value (`--tgtCcy quote_ccy`), or USDT margin cost (`--tgtCcy margin`). If the user specifies a USDT amount, clarify whether it is notional value or margin cost, then pass directly as `--sz` with the appropriate `--tgtCcy` — do NOT manually convert to contracts. With `margin` mode, the system queries current leverage and calculates: `contracts = floor(margin * lever / (ctVal * lastPx))`
- **Linear vs inverse**: `BTC-USDT-<YYMMDD>` is linear; `BTC-USD-<YYMMDD>` is inverse (USD face value, BTC settlement). For inverse, use `--tgtCcy quote_ccy` or `--tgtCcy margin` to specify a USD amount (note: `quote_ccy` = USD, not USDT for inverse instruments); warn the user that margin and P&L are settled in BTC
- **instId format**: delivery futures use date suffix: `BTC-USDT-<YYMMDD>` (e.g., `BTC-USDT-260328` for March 28, 2026 expiry)
- **Expiry**: futures expire on the delivery date — all positions auto-settle; do not hold through expiry unless intended
- **Close position**: use `futures close` to close the **entire** position at market price — same semantics as `swap close`; to partial close, use `futures place` with `--reduceOnly`
- **Leverage**: `futures leverage` sets leverage for a futures instrument, same constraints as swap; max leverage varies by instrument and account level. **If set-leverage fails with "Cancel cross-margin TP/SL … or stop bots"**: this means pending algo orders or active trading bots exist on that instrument under cross margin. Troubleshoot in order: (1) `okx futures algo-orders --instId <id> --status pending` — check for TP/SL, trailing, trigger, chase orders (most common cause); (2) only if no algo orders found, check bots: `okx bot grid-orders --type contract_grid --status active`. **Never automatically cancel algo orders or stop bots** — show findings to the user and let them decide which to cancel/stop
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both; same parameters as swap — `--tdMode` and `--posSide` required in hedge mode
- **Algo on close side**: always set `--side` opposite to position (e.g., long position → `sell` algo)
