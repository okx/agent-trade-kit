# Grid Bot Command Reference

## Grid Bot — Create

```bash
okx bot grid create --instId <id> --algoOrdType <type> \
  --maxPx <px> --minPx <px> --gridNum <n> \
  [--runType <1|2>] \
  [--quoteSz <n>] [--baseSz <n>] \
  [--direction <long|short|neutral>] [--lever <n>] [--sz <n>] \
  [--basePos] [--no-basePos] \
  [--tpTriggerPx <px>] [--slTriggerPx <px>] [--tpRatio <ratio>] [--slRatio <ratio>] \
  [--algoClOrdId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Instrument (e.g., `BTC-USDT` for spot, `BTC-USDT-SWAP` for USDT-M contract, `BTC-USD-SWAP` for coin-M contract) |
| `--algoOrdType` | Yes | - | `grid` (spot grid) or `contract_grid` (contract grid, including coin-margined) |
| `--maxPx` | Yes | - | Upper price boundary |
| `--minPx` | Yes | - | Lower price boundary |
| `--gridNum` | Yes | - | Grid levels (2–100) |
| `--runType` | No | `1` | `1`=arithmetic spacing, `2`=geometric spacing |
| `--quoteSz` | Cond. | - | USDT investment — spot grid only (provide `quoteSz` or `baseSz`) |
| `--baseSz` | Cond. | - | Base currency investment — spot grid only |
| `--direction` | Cond. | - | `long`, `short`, or `neutral` — required for contract grid |
| `--lever` | Cond. | - | Leverage (e.g., `5`) — contract grid only |
| `--sz` | Cond. | - | Investment margin in USDT (USDT-M) or coin (coin-M) — contract grid only |
| `--basePos` / `--no-basePos` | No | `true` | Open a base position at creation — contract grid only (ignored for neutral). Use `--no-basePos` to disable |
| `--tpTriggerPx` | No | - | Take-profit trigger price (mutually exclusive with `--tpRatio`) |
| `--slTriggerPx` | No | - | Stop-loss trigger price (mutually exclusive with `--slRatio`) |
| `--tpRatio` | No | - | Take-profit ratio — contract grid only (mutually exclusive with `--tpTriggerPx`) |
| `--slRatio` | No | - | Stop-loss ratio — contract grid only (mutually exclusive with `--slTriggerPx`) |
| `--algoClOrdId` | No | - | Client-defined algo order ID (1-32 alphanumeric). Unique per user, enables idempotent creation |

**Examples:**

```bash
# Spot grid: BTC $90k–$100k, 10 grids, 1000 USDT
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --minPx 90000 --maxPx 100000 --gridNum 10 --quoteSz 1000

# Contract grid: BTC perp, neutral, 5x, 100 USDT margin
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --minPx 90000 --maxPx 100000 --gridNum 10 \
  --direction neutral --lever 5 --sz 100

# Coin-margined contract grid: BTC inverse perp
okx bot grid create --instId BTC-USD-SWAP --algoOrdType contract_grid \
  --minPx 90000 --maxPx 100000 --gridNum 10 \
  --direction long --lever 5 --sz 0.01
```

---

## Grid Bot — Amend

```bash
okx bot grid amend --algoId <id> \
  [--maxPx <px> --minPx <px> --gridNum <n>] \
  [--instId <id>] \
  [--tpTriggerPx <px>] [--slTriggerPx <px>] \
  [--tpRatio <ratio>] [--slRatio <ratio>] \
  [--topUpAmt <n>] [--json]
```

Supports two modes that can be combined in one call:

**Price-range mode** — triggered when `--maxPx` is provided:

| Param | Required | Description |
|---|---|---|
| `--algoId` | Yes | Grid bot algo order ID |
| `--maxPx` | Yes | New upper price boundary |
| `--minPx` | Yes (with maxPx) | New lower price boundary |
| `--gridNum` | Yes (with maxPx) | New grid count (integer) |
| `--topUpAmt` | No | Extra margin to add (contract grid only; omit to auto-use minimum required) |

**TP/SL mode** — triggered when at least one TP/SL param is provided; `--instId` is also required:

| Param | Required | Description |
|---|---|---|
| `--instId` | Yes | Instrument ID (e.g., `BTC-USDT`) |
| `--tpTriggerPx` | No | Take-profit trigger price (absolute). Pass `-1` to clear |
| `--slTriggerPx` | No | Stop-loss trigger price (absolute). Pass `-1` to clear |
| `--tpRatio` | No | Take-profit ratio (e.g., `0.1` = 10%). Contract grid only. Pass `-1` to clear |
| `--slRatio` | No | Stop-loss ratio (e.g., `0.1` = 10%). Contract grid only. Pass `-1` to clear |
| `--topUpAmt` | No | Extra margin to add (contract grid only) |

> **Note**: `tpTriggerPx`/`tpRatio` are mutually exclusive. Same for `slTriggerPx`/`slRatio`.

**Examples:**

```bash
# Amend grid price range
okx bot grid amend --algoId 3486105572796182528 --maxPx 102000 --minPx 88000 --gridNum 14

# Amend grid TP/SL
okx bot grid amend --algoId 3486105572796182528 --instId BTC-USDT --tpTriggerPx 110000 --slTriggerPx 80000

# Amend both in one call (combined mode)
okx bot grid amend --algoId 3486105572796182528 \
  --maxPx 102000 --minPx 88000 --gridNum 14 \
  --instId BTC-USDT --tpTriggerPx 110000 --slTriggerPx 80000

# Clear TP/SL (use =-1 syntax for negative values)
okx bot grid amend --algoId 3486105572796182528 --instId BTC-USDT --tpTriggerPx=-1 --slTriggerPx=-1
```

---

## Grid Bot — Stop

```bash
okx bot grid stop --algoId <id> --algoOrdType <type> --instId <id> \
  [--stopType <1|2>] [--json]
```

> **`--algoId`** and **`--algoOrdType`** must come from `bot grid orders` output. The `algoOrdType` must match the bot's actual type — do not guess.

**Workflow:**
1. Run `bot grid details --algoId <id> --algoOrdType <type>` and check the `state` field.
2. If `state=running`: call stop with `--stopType 1` (default, clean exit) or `--stopType 2` (keep assets).
3. If `state=no_close_position` (user previously stopped with stopType=2): call stop again with `--stopType 1` to close the remaining open position.

| `--stopType` | Spot grid | Contract grid |
|---|---|---|
| `1` (default) | Sells all base assets back to quote | Market-closes all open positions |
| `2` | Keeps base assets as-is | Cancels grid orders, leaves position open |

---

## Grid Bot — Positions

```bash
okx bot grid positions --algoId <id> --algoOrdType contract_grid [--json]
```

Returns open contract-grid positions: liquidation price (`liqPx`), margin ratio (`mgnRatio`), and unrealized PnL (`upl`). Only applicable to `contract_grid` bots.

---

## Grid Bot — Liquidation Price

```bash
okx bot grid liquidate-price --instId <id> --sz <margin> --lever <leverage> \
  --maxPx <px> --minPx <px> --gridNum <n> --direction <long|short|neutral> \
  [--runType <1|2>] [--triggerStrategy <instant|price|rsi|webhook>] [--json]
```

Estimates the liquidation price for a contract-grid bot. Use before creating a bot to assess liquidation risk. The estimate needs the **full intended config** — the backend requires `instId`, `sz`, `lever`, the grid range (`maxPx`/`minPx`/`gridNum`) and `direction` (use `neutral` for a neutral bot); omitting any of them fails fast with the list of what's missing. `runType` defaults to `1` (arithmetic; `2`=geometric) and `triggerStrategy` is optional.

---

## Grid Bot — Close Position

```bash
okx bot grid close-position --algoId <id> (--mktClose | --no-mktClose) [--sz <size>] [--px <price>] [--json]
```

Closes the remaining open position of a contract-grid bot that was stopped with `stopType='2'`. The close mode is **required** (no default, because it moves funds): pass `--mktClose` for a market close (immediate), or `--no-mktClose --sz <size> --px <price>` for a limit close order. Omitting both is rejected.

---

## Grid Bot — List Orders

```bash
okx bot grid orders --algoOrdType <type> [--instId <id>] [--algoId <id>] [--history] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--algoOrdType` | Yes | - | `grid` (spot), `contract_grid` (contract), or `moon_grid` (moon) |
| `--instId` | No | - | Filter by instrument |
| `--algoId` | No | - | Filter by algo order ID. NOT a normal trade order ID |
| `--history` | No | false | Show completed/stopped bots instead of active |

**Example:**

```bash
# List all active bots
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType contract_grid
```

---

## Grid Bot — Details

```bash
okx bot grid details --algoOrdType <type> --algoId <id> [--json]
```

Returns: bot config, current PnL (`pnlRatio`), grid range, number of grids, state, position info.

---

## Grid Bot — Sub-Orders

```bash
okx bot grid sub-orders --algoOrdType <type> --algoId <id> [--pending] [--groupId <id>] [--after <id>] [--before <id>] [--limit <n>] [--json]
```

| Flag | Effect |
|---|---|
| *(default)* | Filled sub-orders (executed grid trades) |
| `--pending` | Pending grid orders currently on the book. (Works in demo mode. `--live` is a deprecated alias and cannot be combined with `--demo`.) |
| `--groupId` | Filter to one buy-sell pair (shared groupId) |
| `--after` | Pagination cursor — records older than this id |
| `--before` | Pagination cursor — records newer than this id |
| `--limit` | Max records to return (default 100) |

---

## Edge Cases — Grid Bot

- **Price out of range**: `--minPx` must be < current price < `--maxPx`; check with `okx-cex-market` first
- **Insufficient balance**: check `okx-cex-portfolio` → `account balance` before creating. If insufficient, **do NOT auto-transfer** — report the shortfall and ask the user for instructions
- **Contract grid direction**: `long` (buys more at lower prices), `short` (sells at higher), `neutral` (both). Direction is required for contract grid
- **Contract grid basePos**: defaults to `true` — long/short grids automatically open a base position at creation. Neutral direction ignores this. Pass `--no-basePos` to disable
- **Contract grid --sz**: investment margin in USDT (USDT-M) or coin (coin-M), not number of contracts
- **Coin-margined grids**: use inverse instruments (e.g., `BTC-USD-SWAP`). Margin unit is the base coin (BTC), not USDT
- **Stop type**: `stopType 1` sells/closes all (default); `stopType 2` keeps assets as-is (spot grid) or leaves position open for manual close (contract grid)
- **TP/SL**: `tpTriggerPx`/`tpRatio` and `slTriggerPx`/`slRatio` are mutually exclusive pairs. Ratio-based TP/SL is contract grid only
- **Amend — at least one mode required**: must provide either price-range params (`--maxPx`+`--minPx`+`--gridNum`) or TP/SL params; providing neither returns a validation error
- **Amend — combined mode**: price-range and TP/SL can be combined in one call (two sequential API requests internally)
- **Amend — clear TP/SL**: pass `--tpTriggerPx=-1` or `--slTriggerPx=-1` (use `=` syntax for negative values, not `--flag -1`)
- **Amend — contract grid topUpAmt**: if new range requires more margin, provide `--topUpAmt`; omit to auto-use the minimum required
- **Amend — spot grid topUpAmt**: not supported; omit `--topUpAmt` for spot grids
- **Already stopped bot**: stop returns error — check `bot grid orders --history` first to confirm state
- **Insufficient margin (51340)**: extract required minimum from error, check balance via `okx-cex-portfolio`, report shortfall to user — do NOT auto-transfer
- **Demo mode**: `okx --demo bot grid create ...` (OAuth) or `okx --profile <demo-profile> bot grid create ...` (API Key) — safe for testing, no real funds
- **algoClOrdId duplicate**: if the same `algoClOrdId` already exists, the API returns error code `51065`

---

## Parameter Display Names

### Grid Bot — Spot (`algoOrdType=grid`)

| API Field | EN | ZH |
|---|---|---|
| `instId` | Trading pair | 交易对 |
| `minPx` | Lower price bound | 网格下限价格 |
| `maxPx` | Upper price bound | 网格上限价格 |
| `gridNum` | Number of grids | 网格数量 |
| `quoteSz` | Investment amount ({quote}) | 投入金额（{quote}） |
| `baseSz` | Investment amount ({base}) | 投入金额（{base}） |
| `runType` | Spacing mode (1=arithmetic, 2=geometric) | 网格间距模式（1=等差, 2=等比） |
| `stopType` | Stop behavior | 停止方式 |

### Grid Bot — Contract (`algoOrdType=contract_grid`)

| API Field | EN | ZH |
|---|---|---|
| `instId` | Trading pair | 交易对 |
| `minPx` | Lower price bound | 网格下限价格 |
| `maxPx` | Upper price bound | 网格上限价格 |
| `gridNum` | Number of grids | 网格数量 |
| `sz` | Investment margin (USDT for USDT-M; {base} for coin-M) | 投入保证金（USDT-M 为 USDT；币本位为 {base}） |
| `direction` | Direction (long / short / neutral) | 方向（做多 / 做空 / 中性） |
| `lever` | Leverage | 杠杆倍数 |
| `runType` | Spacing mode (1=arithmetic, 2=geometric) | 网格间距模式（1=等差, 2=等比） |
| `basePos` | Open base position | 是否开底仓 |
| `stopType` | Stop behavior | 停止方式 |
