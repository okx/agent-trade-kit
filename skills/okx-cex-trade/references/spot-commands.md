# Spot Command Reference

## Order Type Reference

| `--ordType` | Description | Requires `--px` |
|---|---|---|
| `market` | Fill immediately at best price | No |
| `limit` | Fill at specified price or better | Yes |
| `post_only` | Limit order; cancelled if it would be a taker | Yes |
| `fok` | Fill entire order immediately or cancel | Yes |
| `ioc` | Fill what's available immediately, cancel rest | Yes |
| `conditional` | Algo: single TP or SL trigger | No (set trigger px) |
| `oco` | Algo: TP + SL together (one cancels other) | No (set both trigger px) |
| `move_order_stop` | Trailing stop (spot/swap/futures) | No (set callback) |

---

## Spot — Place Order

```bash
okx spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  [--tgtCcy <base_ccy|quote_ccy>] [--px <price>] \
  [--tpTriggerPx <p>] [--tpOrdPx=<p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx=<p|-1>] \
  [--clOrdId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Spot instrument (e.g., `BTC-USDT`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--sz` | Yes | - | Order size — unit depends on `--tgtCcy` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in base currency (e.g. SOL amount); `quote_ccy`: sz in quote currency (e.g. USDT amount) |
| `--px` | Cond. | - | Price — required for `limit`, `post_only`, `fok`, `ioc` |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution (must use `=` form: `--tpOrdPx=-1`) |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution (must use `=` form: `--slOrdPx=-1`) |
| `--clOrdId` | No | - | Client-assigned order ID (max 32 chars alphanumeric + `-` `_`) |

---

## Spot — Cancel Order

```bash
okx spot cancel --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

At least one of `--ordId` or `--clOrdId` is required.

---

## Spot — Amend Order

```bash
okx spot amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

Must provide at least one of `--newSz` or `--newPx`.

---

## Spot — Place Algo (TP/SL / Trail)

```bash
okx spot algo place --instId <id> --side <buy|sell> \
  --ordType <oco|conditional|move_order_stop> --sz <n> \
  [--clOrdId <id>] \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--tpTriggerPx <p>] [--tpOrdPx=<p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx=<p|-1>] \
  [--callbackRatio <r>] [--callbackSpread <s>] [--activePx <p>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Spot instrument (e.g., `BTC-USDT`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `oco`, `conditional`, or `move_order_stop` |
| `--sz` | Yes | - | Order size in base currency |
| `--clOrdId` | No | - | Client-assigned algo order ID (max 32 chars alphanumeric + `-` `_`) |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in base currency; `quote_ccy`: sz in quote currency (e.g. USDT) |
| `--tpTriggerPx` | Cond. | - | Take-profit trigger price |
| `--tpOrdPx` | Cond. | - | TP order price; use `-1` for market execution (must use `=` form: `--tpOrdPx=-1`) |
| `--slTriggerPx` | Cond. | - | Stop-loss trigger price |
| `--slOrdPx` | Cond. | - | SL order price; use `-1` for market execution (must use `=` form: `--slOrdPx=-1`) |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

For `oco`: provide both TP and SL params. For `conditional`: provide only TP or only SL. For `move_order_stop`: provide `--callbackRatio` or `--callbackSpread` (one required).

---

## Spot — Amend Algo

```bash
okx spot algo amend --instId <id> --algoId <id> \
  [--newSz <n>] [--newTpTriggerPx <p>] [--newTpOrdPx <p>] \
  [--newSlTriggerPx <p>] [--newSlOrdPx <p>] [--json]
```

> **Note**: Use this to modify TP/SL orders attached when placing the main order. Run `okx spot algo orders` first to find the `algoId`.

---

## Spot — Cancel Algo

```bash
okx spot algo cancel --instId <id> --algoId <id> [--json]
```

---

## Spot — Place Trailing Stop

```bash
okx spot algo trail --instId <id> --side <buy|sell> --sz <n> \
  [--callbackRatio <ratio>] [--callbackSpread <spread>] \
  [--activePx <price>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Spot instrument (e.g., `BTC-USDT`) |
| `--side` | Yes | - | `buy` or `sell` — use `sell` to protect a long spot position |
| `--sz` | Yes | - | Order size in base currency |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

> Spot trailing stop does not require `--tdMode` or `--posSide` (spot has no margin mode or position side concept).

---

## Spot — List Orders

```bash
okx spot orders [--instId <id>] [--history] [--json]
```

| Flag | Effect |
|---|---|
| *(default)* | Open/pending orders |
| `--history` | Historical (filled, cancelled) orders |

---

## Spot — Get Order

```bash
okx spot get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

Returns: `ordId`, `instId`, `side`, `ordType`, `px`, `sz`, `fillSz`, `avgPx`, `state`, `cTime`.

---

## Spot — Fills

```bash
okx spot fills [--instId <id>] [--ordId <id>] [--json]
```

Returns: `instId`, `side`, `fillPx`, `fillSz`, `fee`, `ts`.

---

## Spot — Algo Orders

```bash
okx spot algo orders [--instId <id>] [--history] [--ordType <type>] [--json]
```

Returns: `algoId`, `instId`, type, `side`, `sz`, `tpTrigger`, `slTrigger`, `state`.

---

## Edge Cases — Spot

- **Market order size**: default `--sz` is in base currency (e.g., BTC amount). If user specifies a USDT amount, use `--tgtCcy quote_ccy` and pass the USDT value as `--sz` directly — do NOT manually convert
- **Insufficient balance**: check `okx-cex-portfolio account balance` before placing
- **Price not required**: `market` orders don't need `--px`; `limit` / `post_only` / `fok` / `ioc` do
- **Algo oco**: provide both `tpTriggerPx` and `slTriggerPx`; price `-1` means market execution at trigger
- **Fills vs orders**: `fills` shows executed trades; `orders --history` shows all orders including cancelled
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both; `--tdMode` and `--posSide` are not required for spot
- **Algo on close side**: always set `--side` opposite to position direction (e.g., long spot holding → `sell` algo, short spot → `buy` algo)
