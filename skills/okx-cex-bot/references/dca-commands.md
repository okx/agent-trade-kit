# DCA Bot Command Reference

## DCA Bot — Create (Spot & Contract)

```bash
okx bot dca create --algoOrdType <spot_dca|contract_dca> --instId <id> \
  [--direction <long|short>] \
  --initOrdAmt <n> --maxSafetyOrds <n> --tpPct <ratio> \
  [--lever <n>] [--safetyOrdAmt <n>] [--pxSteps <ratio>] [--pxStepsMult <mult>] [--volMult <mult>] \
  [--slPct <ratio>] [--slMode <limit|market>] [--allowReinvest] \
  [--triggerStrategy <instant|price|rsi>] [--triggerPx <price>] \
  [--triggerCond <cross_up|cross_down>] [--thold <threshold>] [--timeframe <timeframe>] [--timePeriod <period>] \
  [--algoClOrdId <id>] [--reserveFunds <true|false>] [--tradeQuoteCcy <ccy>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--algoOrdType` | Yes | - | `spot_dca` (Spot DCA) or `contract_dca` (Contract DCA) |
| `--instId` | Yes | - | Instrument (e.g., `BTC-USDT` for spot, `BTC-USDT-SWAP` for contract) |
| `--lever` | Cond. | - | Leverage multiplier (e.g., `3`). Required for `contract_dca` |
| `--direction` | Cond. | `long` | `long` or `short`. Optional for `spot_dca` (defaults to `long`); required for `contract_dca` |
| `--initOrdAmt` | Yes | - | Initial order amount (quote currency) |
| `--maxSafetyOrds` | Yes | - | Max safety orders, integer [0, 100] (e.g., `3`; `0` = no DCA) |
| `--safetyOrdAmt` | Cond. | - | Safety order amount (quote currency). Required when `maxSafetyOrds > 0` |
| `--pxSteps` | Cond. | - | Initial price deviation [0.001, 0.5], e.g., `0.03` = 3%. Required when `maxSafetyOrds > 0` |
| `--pxStepsMult` | Cond. | `1` | Price step multiplier (e.g., `1.2`). Required when `maxSafetyOrds > 0` |
| `--volMult` | Cond. | `1` | Safety order size multiplier (e.g., `1.5`). Required when `maxSafetyOrds > 0` |
| `--tpPct` | Yes | - | Take-profit ratio: long [0.001, 10], short [0.001, 0.9999] (e.g., `0.03` = 3%) |
| `--slPct` | No | - | Stop-loss ratio, must exceed MPD (e.g., `0.05` = 5%). Must be used with `--slMode` |
| `--slMode` | No | `market` | Stop-loss type: `limit` or `market`. Must be used with `--slPct` |
| `--allowReinvest` | No | `true` | Reinvest profit into the next DCA cycle |
| `--triggerStrategy` | No | `instant` | contract_dca: `instant`, `price`, `rsi`; spot_dca: `instant`, `rsi` |
| `--triggerPx` | No | - | Trigger price — required when `triggerStrategy=price` (contract_dca only) |
| `--triggerCond` | No | - | `cross_up` or `cross_down` — required when `triggerStrategy=rsi`, optional when `triggerStrategy=price` |
| `--thold` | No | - | RSI threshold (e.g. `30`) — required when `triggerStrategy=rsi` |
| `--timeframe` | No | - | RSI timeframe (e.g. `15m`) — required when `triggerStrategy=rsi` |
| `--timePeriod` | No | `14` | RSI period — optional when `triggerStrategy=rsi` |
| `--algoClOrdId` | No | - | Client-defined strategy order ID (1-32 alphanumeric) |
| `--reserveFunds` | No | `true` | `true` or `false` — whether to reserve funds |
| `--tradeQuoteCcy` | No | - | Trade quote currency |

**Conditional required logic:**
- Always required: `--algoOrdType`, `--instId`, `--initOrdAmt`, `--maxSafetyOrds`, `--tpPct`
- `--direction`: optional for `spot_dca` (defaults to `long`); **required** for `contract_dca`
- When `algoOrdType=contract_dca`: also required `--lever`
- When `maxSafetyOrds > 0`: also required `--safetyOrdAmt`, `--pxSteps`, `--pxStepsMult`, `--volMult`
- `--slPct` and `--slMode` must be both set or both omitted

**Examples:**

```bash
# Contract DCA bot: BTC perp, long, 3x, 3% TP
okx bot dca create --algoOrdType contract_dca --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 --tpPct 0.03

# Spot DCA bot: BTC spot, long, 5% TP
okx bot dca create --algoOrdType spot_dca --instId BTC-USDT --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1.2 --volMult 1.5 --tpPct 0.05
```

---

## DCA Bot — Stop

```bash
okx bot dca stop --algoOrdType <spot_dca|contract_dca> --algoId <id> [--stopType <1|2>] [--json]
```

**Workflow:**
1. Run `bot dca details --algoId <id> --algoOrdType <type>` and check the `state` field.
2. If `state=running`: call stop (with `--stopType` for spot_dca).
3. If `state=no_close_position` (user previously stopped with stopType=2): call stop again with `--stopType 1` to close the remaining open position.

| Param | Required | Default | Description |
|---|---|---|---|
| `--algoOrdType` | Yes | - | `spot_dca` or `contract_dca` |
| `--algoId` | Yes | - | DCA bot algo order ID (from create or list output). NOT a normal trade order ID |
| `--stopType` | Cond. | `1` | `spot_dca` required: `1`=sell all tokens, `2`=keep tokens. `contract_dca`: `1`=close position (default), `2`=keep position open |

---

## DCA Bot — List Orders

```bash
okx bot dca orders [--algoOrdType <spot_dca|contract_dca>] [--algoId <id>] [--instId <id>] [--history] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--algoOrdType` | No | `contract_dca` | Filter by strategy type |
| `--algoId` | No | - | Filter by DCA bot algo order ID |
| `--instId` | No | - | Filter by instrument |
| `--history` | No | false | Show completed/stopped bots instead of active |

Returns bot summary + PnL. Also returns `transferInMargin` (net margin transferred in).

**Example:**

```bash
# List all active bots
okx bot dca orders --algoOrdType contract_dca
okx bot dca orders --algoOrdType spot_dca
```

---

## DCA Bot — Details

```bash
okx bot dca details --algoOrdType <spot_dca|contract_dca> --algoId <id> [--json]
```

Returns: `avgPx`, `upl`, `liqPx`, `notionalUsd`, `sz`, `tpPx`, `slPx`, `initPx`, `fundingFee`, `fee`, `fillSafetyOrds`, `algoClOrdId`, `baseSz`, `quoteSz`, `tradeQuoteCcy`.

---

## DCA Bot — Sub-Orders

```bash
okx bot dca sub-orders --algoOrdType <spot_dca|contract_dca> --algoId <id> [--cycleId <id>] [--after <id>] [--before <id>] [--limit <n>] [--json]
```

| Flag / Param | Effect |
|---|---|
| *(default)* | List all cycles |
| `--cycleId <id>` | Show orders within a specific cycle |

---

## DCA Bot — Add Margin

```bash
okx bot dca add-margin --algoId <id> --amt <amount> [--json]
```

| Param | Required | Description |
|---|---|---|
| `--algoId` | Yes | DCA bot algo order ID |
| `--amt` | Yes | Amount to add in quote currency. Must be a positive finite number |

**Note:** Only applies to contract DCA bots (`algoOrdType: contract_dca`).

**Error codes:** `59302` → Cancel the pending close order first, then retry. `59301` → Adjustment amount is outside the allowed margin range.

---

## DCA Bot — Reduce Margin

```bash
okx bot dca reduce-margin --algoId <id> --amt <amount> [--json]
```

| Param | Required | Description |
|---|---|---|
| `--algoId` | Yes | DCA bot algo order ID |
| `--amt` | Yes | Amount to reduce in quote currency. Must be a positive finite number |

**Note:** Only applies to contract DCA bots (`algoOrdType: contract_dca`).

**Error codes:** `59302` → Cancel the pending close order first, then retry. `59301` → Adjustment amount is outside the allowed margin range.

---

## DCA Bot — Update Take-Profit

```bash
okx bot dca update-tp --algoId <id> --tpPrice <price> [--json]
```

| Param | Required | Description |
|---|---|---|
| `--algoId` | Yes | DCA bot algo order ID |
| `--tpPrice` | Yes | New take-profit price |

**Note:** Only applies to contract DCA bots (`algoOrdType: contract_dca` is hardcoded internally — you do not need to pass it).

**Error codes:** `51223` → Not available for sync copy-trading follower accounts.

---

## Edge Cases — DCA Bot

- **Spot DCA direction**: optional, defaults to `long` when omitted. Spot DCA only supports long — if the user explicitly asks for "short spot DCA", explain it's not supported (an explicit non-`long` value is forwarded to the backend, which rejects it)
- **Spot DCA stopType**: always ask user whether to sell all tokens (`1`) or keep them (`2`) when stopping
- **Contract DCA lever**: required. If missing, the tool returns a validation error
- **pxStepsMult**: `1.0` = equal spacing; `>1.0` = widen gaps between successive safety orders
- **volMult**: `1.0` = equal sizes; `>1.0` = increase per safety order (Martingale scaling)
- **triggerStrategy**: `instant` starts immediately; `price` waits for trigger price (contract_dca only); `rsi` waits for RSI condition (both spot_dca and contract_dca)
- **Already stopped bot**: stop returns error — check `bot dca orders --history` first
- **Demo mode**: `okx --demo bot dca create ...` (OAuth) or `okx --profile <demo-profile> bot dca create ...` (API Key) — safe testing, no real funds
- **INVALID_PRICE_STEPS_MULTIPLIER error**: adjust `slPct`. Recalculate MPD = Σ(pxSteps × pxStepsMult^i) for i = 0..maxSafetyOrds−1, then set `slPct` > MPD
- **algoClOrdId duplicate**: error code `51065`
- **Margin adjustment blocked by pending close order (`59302`)**: `bot dca add-margin`/`reduce-margin` fails if the position has a pending close order. Tell the user to cancel the pending close order first, then retry
- **Margin adjustment out of range (`59301`)**: `bot dca add-margin`/`reduce-margin` fails if the adjustment would push margin outside the allowed range. Report the error; do not retry with an arbitrary different amount without asking the user
- **Sync copy-trading follower blocked (`51223`)**: `bot dca update-tp` is not available for sync copy-trading follower accounts (`copyType=2` + `trackingMode=sync`). Explain this to the user rather than retrying

---

## Parameter Display Names

### DCA Bot (Spot & Contract)

| API Field | EN | ZH |
|---|---|---|
| `algoOrdType` | Strategy type (spot/contract) | 策略类型（现货/合约） |
| `instId` | Trading pair | 交易对 |
| `initOrdAmt` | Initial order amount ({quote}) | 首单金额（{quote}） |
| `safetyOrdAmt` | Safety order amount ({quote}) | 补仓金额（{quote}） |
| `maxSafetyOrds` | Max safety orders | 最大补仓次数 |
| `pxSteps` | Price drop per safety order (%) | 补仓价格跌幅（%） |
| `pxStepsMult` | Price step multiplier | 补仓跌幅倍数 |
| `volMult` | Safety order size multiplier | 补仓金额倍数 |
| `tpPct` | Take-profit ratio (%) | 止盈比例（%） |
| `slPct` | Stop-loss ratio (%) | 止损比例（%） |
| `slMode` | Stop-loss type (limit/market) | 止损类型（限价/市价） |
| `lever` | Leverage | 杠杆倍数 |
| `direction` | Direction (long/short) | 方向（做多/做空） |
| `allowReinvest` | Reinvest profit | 利润再投入 |
| `triggerStrategy` | Trigger mode (contract_dca: instant/price/rsi; spot_dca: instant/rsi) | 触发方式 |
| `triggerPx` | Trigger price | 触发价格 |
| `algoClOrdId` | Client order ID | 客户端策略订单 ID |
| `stopType` | Stop type (sell all / keep tokens) | 停止类型（卖出/保留） |
| `reserveFunds` | Reserve funds | 预留资金 |
| `amt` | Amount (margin adjustment) | 金额（保证金调整） |
| `tpPrice` | New take-profit price | 新止盈价格 |
| `tradeQuoteCcy` | Quote currency for trade | 交易计价货币 |

> **`slPct` stop-loss logic:**
> - Long: stop-loss price = initial fill price × (1 − slPct)
> - Short: stop-loss price = initial fill price × (1 + slPct)
> When triggered and position fully closed, the bot ends.
