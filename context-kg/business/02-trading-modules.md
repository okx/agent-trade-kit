<!-- triggers: spot, swap, futures, option, trade, order, place, cancel, amend, algo, trailing, tpsl, tgtCcy, leverage, contract, instId, orderId -->
# Trading Modules

The trading domain is split into four instrument-type modules plus a shared algorithmic order module. All four share common contract-trade utilities but differ in instrument type, margin model, and settlement currency.

## Instrument-Type Modules

### spot (`packages/core/src/tools/spot-trade.ts`)
- Spot market trading with immediate settlement
- Supports market, limit, post-only, and FOK/IOC order types
- TP/SL via `attachAlgoOrds` parameter
- Trailing stop orders via `spot_place_algo_order`
- Quote currency (`tgtCcy=quote_ccy`) controls whether order size is in base or quote currency

### swap (`packages/core/src/tools/swap-trade.ts`)
- Perpetual swap contracts (no expiry date)
- Cross/isolated margin, long/short positions
- Algo orders: TP/SL, trailing stop, iceberg, TWAP
- Size is always in contracts (unlike spot where `tgtCcy` switches units)

### futures (`packages/core/src/tools/futures-trade.ts`)
- Dated futures with specific expiry (`instId` format: `BTC-USD-250328`)
- Same margin/position model as swap
- Trailing stop algo via `futures_place_algo_order`

### option (`packages/core/src/tools/option-trade.ts` + `option-algo-trade.ts`)
- Vanilla options (calls and puts)
- `instId` format: `BTC-USD-250328-50000-C`
- Separate file `option-algo-trade.ts` for algo orders due to schema differences

## Algorithmic Order Module (`algo-trade.ts`)

The `algo-trade` module (`packages/core/src/tools/algo-trade.ts`) provides cross-instrument algo capabilities:

- **TP/SL orders**: trigger-based take-profit and stop-loss with `tpTriggerPx`/`slTriggerPx`
- **Trailing stop**: `algoOrdType=trailing_stop`, tracks price movement by `callbackRatio` or `callbackSpread`
- **Iceberg/TWAP**: split large orders into smaller tranches over time
- **Trigger orders**: conditional orders that activate when a price condition is met

The module also exposes `algo_list_orders` and `algo_cancel_order` for management.

## tgtCcy Conversion Layer (`tgtccy-conversion.ts`)

`packages/core/src/tools/tgtccy-conversion.ts` contains helpers that convert user-provided USDT amounts into contract quantities for swap/futures tools.

**Background**: The OKX API for SWAP/FUTURES orders accepts `sz` in contracts (e.g., "1 contract = 0.01 BTC"). When a user says "buy $100 USDT of BTC-USDT-SWAP", the tool must compute `sz = floor(100 / contractVal / markPrice)`. The conversion layer handles:
- Fetching contract value and mark price
- Converting USDT notional → contract count
- Rounding to lot size

**Note**: `tgtCcy=quote_ccy` is silently ignored by OKX API for SWAP orders — the conversion must happen client-side.

## Shared Contract Trade Logic (`contract-trade.ts`)

`packages/core/src/tools/contract-trade.ts` contains helpers shared by swap, futures, and option:
- `buildContractOrderParams` — assembles the OKX `/api/v5/trade/order` payload
- Position side logic (`posSide`: `long`/`short`/`net`)
- Reduce-only flag handling

## Key Patterns

- **instId format**: `{base}-{quote}[-{expiry}[-{strike}-{C/P}]]` (e.g., `BTC-USDT`, `BTC-USD-SWAP`, `BTC-USD-250328`, `BTC-USD-250328-50000-C`)
- **Price/size as strings**: all monetary values (price, size, TP/SL triggers) are passed as strings per OKX API convention
- **Algo vs regular paths**: each instrument module has both a `place_order` and `place_algo_order` tool; always update both when modifying order parameters
