# Phase 2 Algo ordTypes — CLI↔OKX OpenAPI Drift Audit

Added in issue #181. Four new `ordType` values for `/api/v5/trade/order-algo`, expanding the enum on `swap_place_algo_order`, `futures_place_algo_order`, and `spot_place_algo_order` from 3 to 7 values.

## Background

OKX OpenAPI v5 `/api/v5/trade/order-algo` supports 7 `ordType` values. Phase 1 (#178 / MR !289) closed the additive-flags gap on the existing 3 types. Phase 2 (#181) adds the remaining 4 types.

Full enum (post Phase 2):
`conditional` | `oco` | `move_order_stop` | `trigger` | `chase` | `iceberg` | `twap`

## New ordType Definitions

### `trigger` — Pending Order

Submits a limit (or market) order when the market price crosses `triggerPx`.

| Parameter       | Required | Notes |
|-----------------|----------|-------|
| `triggerPx`     | Yes      | Activation price |
| `orderPx`       | Yes      | Order price; `-1` = market |
| `advanceOrdType`| No       | `fok` (fill-or-kill) or `ioc` (immediate-or-cancel) |
| `triggerPxType` | No       | `last` (default) \| `index` \| `mark` |
| `attachAlgoOrds`| No       | Optional TP/SL on the resulting fill — assembled via `buildAttachAlgoOrds()` |

CLI: `okx {swap,spot,futures} algo place --ordType trigger --triggerPx <price> --orderPx <price|-1>`

### `chase` — Smart-Follow Best Bid/Ask

Continuously chases the best price within configurable bounds.

| Parameter    | Required | Notes |
|--------------|----------|-------|
| `chaseType`  | No       | `distance` (default) or `ratio` |
| `chaseVal`   | No       | Chase amount: e.g. `0.5` ticks (distance) or `0.001` (ratio) |
| `maxChaseType`| Cond.   | `distance` \| `ratio` — unit for the upper bound |
| `maxChaseVal` | Cond.   | Upper bound value |

CLI: `okx {swap,spot,futures} algo place --ordType chase [--chaseType distance|ratio] [--chaseVal <n>] [--maxChaseType distance|ratio] [--maxChaseVal <n>]`

### `iceberg` — Large-Order Split

Breaks a large order into multiple child orders at fixed intervals.

| Parameter      | Required | Notes |
|----------------|----------|-------|
| `pxVar`        | Cond.    | Price variance % — range [0.0001, 0.01]; provide `pxVar` OR `pxSpread` |
| `pxSpread`     | Cond.    | Price variance constant >= 0; provide `pxVar` OR `pxSpread` |
| `szLimit`      | Yes      | Average size per child order |
| `pxLimit`      | Yes      | Order price ceiling >= 0 |
| `timeInterval` | Yes      | Seconds between child orders |

CLI: `okx {swap,spot,futures} algo place --ordType iceberg --szLimit <n> --pxLimit <price> --timeInterval <secs> [--pxVar <n>|--pxSpread <n>]`

### `twap` — Time-Weighted Average Price

Splits a large order over time to minimize market impact. Uses the same parameter family as `iceberg`.

| Parameter      | Required | Notes |
|----------------|----------|-------|
| `pxVar`        | Cond.    | Price variance %; provide `pxVar` OR `pxSpread` |
| `pxSpread`     | Cond.    | Price variance constant; provide `pxVar` OR `pxSpread` |
| `szLimit`      | Yes      | Average size per child order |
| `pxLimit`      | Yes      | Order price ceiling |
| `timeInterval` | Yes      | Seconds between child orders |

CLI: `okx {swap,spot,futures} algo place --ordType twap --szLimit <n> --pxLimit <price> --timeInterval <secs> [--pxVar <n>|--pxSpread <n>]`

## Valid Combinations

- `trigger`: requires `triggerPx` + `orderPx`. `attachAlgoOrds` (TP/SL) valid.
- `chase`: all params optional; provide `maxChaseType` + `maxChaseVal` together.
- `iceberg` / `twap`: `pxVar` and `pxSpread` are mutually exclusive; provide exactly one or neither.
- `stpMode` is valid on all 7 ordTypes (top-level field).
- `cxlOnClosePos` is valid on swap/futures only (not spot) for all ordTypes.

## Backward Compatibility

The switch-case in each handler's `default:` branch retains the pre-Phase-2 behavior for `conditional`, `oco`, and `move_order_stop`. Not passing any Phase 2 flag produces an identical wire payload.

## Implementation Notes

- Schema constants in `packages/core/src/tools/helpers.ts`:
  - `TRIGGER_FLAGS_SCHEMA` — trigger params
  - `CHASE_FLAGS_SCHEMA` — chase params
  - `ICEBERG_TWAP_FLAGS_SCHEMA` — shared iceberg/twap params
- Handler routing via `switch(ordType)` in each algo-place tool handler.
- CLI flags added to `packages/cli/src/parser.ts` (`CliValues` + `CLI_OPTIONS`).
- Pass-through in `packages/cli/src/index.ts` for all three dispatch paths.
- Consolidated CLI routing test: `packages/cli/test/new-ord-types-routing.test.ts`.

## Common OKX Error Codes

| Code   | Meaning | Typical cause |
|--------|---------|---------------|
| 51000  | Parameter error | Missing required param (e.g. `triggerPx` for trigger type) |
| 51001  | Instrument doesn't exist | Wrong `instId` format |
| 51008  | Insufficient funds | Account balance check |
| 51120  | `pxVar` out of range | Not in [0.0001, 0.01] for iceberg/twap |
| 51121  | `timeInterval` too short | Below minimum interval |
| 51140  | `szLimit` too small | Below minimum order size |
