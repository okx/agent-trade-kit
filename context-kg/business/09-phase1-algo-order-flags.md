# Phase 1 Algo Order Flags — CLI↔OKX OpenAPI Drift Audit

Added in issue #178. Five new additive flags for trade-order placement, closing gaps between CLI and OKX OpenAPI v5.

## New Flags

### `--tpOrdKind` (enum: `condition` | `limit`, default: `condition`)
- **Place Order** (`spot_place_order`, `contract_place_order`, `option_place_order`): packed into `attachAlgoOrds[0].tpOrdKind` via `buildAttachAlgoOrds()`.
- **Algo TP/SL** (`spot_place_algo_order`, `swap_place_algo_order`, `futures_place_algo_order`): top-level field.
- Use `limit` for limit take-profit ("immediate TP" style); `condition` is the OKX default (conditional market TP).

### `--tpTriggerPxType` (enum: `last` | `index` | `mark`, default: `last`)
- **Place Order**: packed into `attachAlgoOrds[0].tpTriggerPxType`.
- **Spot algo**: top-level field (`spot_place_algo_order`).
- `tpTriggerPxType` was already exposed on `swap_place_algo_order` and `futures_place_algo_order` prior to Phase 1; Phase 1 adds it on the remaining endpoints (`spot_place_algo_order` and all Place Order tools via `attachAlgoOrds[0]`).
- Determines the price type used to evaluate the TP trigger.

### `--slTriggerPxType` (enum: `last` | `index` | `mark`, default: `last`)
- Same routing as `tpTriggerPxType` — place order via `attachAlgoOrds[0]`, algo top-level.

### `--stpMode` (enum: `cancel_maker` | `cancel_taker` | `cancel_both`)
- **All Place Order tools** and **all algo place tools**: top-level field (NOT inside `attachAlgoOrds`).
- Controls self-trade prevention behaviour.
- Optional; omitting it uses the account-level default.

### `--cxlOnClosePos` (boolean)
- **Algo TP/SL only** (`swap_place_algo_order`, `futures_place_algo_order`).
- NOT on Place Order tools.
- When `true`, the algo order is auto-cancelled when the position is closed.
- Wire format: boolean converted to string `"true"` / `"false"` (same pattern as `reduceOnly`).

## Backward Compatibility

`compactObject` strips `undefined` values — not passing any of these flags produces an identical wire payload to pre-Phase-1 behavior.

## Implementation Details

- `buildAttachAlgoOrds()` in `packages/core/src/tools/helpers.ts` is the single source of truth for assembling `attachAlgoOrds[0]`. After Phase 1 it reads `tpOrdKind`, `tpTriggerPxType`, `slTriggerPxType` in addition to the prior `tpTriggerPx`, `tpOrdPx`, `slTriggerPx`, `slOrdPx`.
- CLI parser (`packages/cli/src/parser.ts`) defines all 5 flags in `CliValues` and `CLI_OPTIONS`.
- CLI command files (`swap.ts`, `spot.ts`, `futures.ts`, `option.ts`) and `index.ts` route new flags through to core tools.
