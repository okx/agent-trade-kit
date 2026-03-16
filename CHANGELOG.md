[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **CLI `okx diagnose --mcp`**: New MCP server troubleshooting mode. Checks package versions, Node.js compatibility, MCP entry-point existence and executability, Claude Desktop `mcpServers` configuration, recent MCP log tail, module-load smoke test (`--version`), and a live stdio JSON-RPC handshake (5 s timeout). Zero external dependencies — uses Node.js built-ins only.
- **`--output <file>` for `okx diagnose`**: Both the default and `--mcp` modes now accept `--output <path>` to save the diagnostic report to a file for sharing.
- **`diagnose-utils.ts`** (internal): Shared `Report`, `ok`, `fail`, `section`, and `sanitize` helpers extracted from `diagnose.ts` to enable reuse by `diagnose-mcp.ts`.
- **`sanitize()` utility**: Masks UUIDs, long hex strings (≥32 chars), and Bearer tokens in diagnostic output before sharing.
- **`allToolSpecs()` exported from `@agent-tradekit/core`**: The function is now part of the public API, exposed for future external consumers that need to enumerate all registered tool specs (e.g. third-party MCP clients, testing utilities). It was already used internally by `buildTools()` and `createToolRunner()`; this change makes the export public-facing for anticipated downstream use, not for use within `diagnose-mcp.ts`.

---

## [1.2.4] - 2026-03-15

### Added

- **`market_get_stock_tokens` tool**: new dedicated tool to list stock token instruments (e.g. `AAPL-USDT-SWAP`, `TSLA-USDT-SWAP`). Fetches all instruments via `GET /api/v5/public/instruments` and filters client-side by `instCategory=3`. Supports `instType` (default `SWAP`) and optional `instId`. ([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**: new CLI sub-command mapping to `market_get_stock_tokens`. Usage: `okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`. ([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **Spot trailing stop support** (`spot_place_algo_order` with `ordType='move_order_stop'`): `spot_place_algo_order` now supports trailing stop orders in addition to conditional/oco. Pass `ordType='move_order_stop'` with `callbackRatio` (e.g. `'0.01'` for 1%) or `callbackSpread` (fixed price distance), and optionally `activePx`. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`swap_place_algo_order` now supports trailing stop** (`ordType='move_order_stop'`): extended with `callbackRatio`, `callbackSpread`, and `activePx` parameters, replacing the need for the deprecated `swap_place_move_stop_order` tool. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`spot_get_algo_orders` now includes trailing stop orders**: When no `ordType` filter is specified, the query now fetches `conditional`, `oco`, and `move_order_stop` orders in parallel. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx spot algo trail`**: New CLI sub-command for placing a spot trailing stop order. Usage: `okx spot algo trail --instId BTC-USDT --side sell --sz 0.001 --callbackRatio 0.01 [--activePx <price>] [--tdMode cash]`. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx futures algo trail`**: New CLI sub-command for placing a futures trailing stop order. Usage: `okx futures algo trail --instId BTC-USD-250328 --side sell --sz 1 --callbackRatio 0.01 [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]`. ([#68](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/68))
- **4 new option algo core tools** (`registerOptionAlgoTools`): `option_place_algo_order`, `option_amend_algo_order`, `option_cancel_algo_orders`, `option_get_algo_orders`. These let AI agents and users place conditional TP/SL algo orders on option positions, amend or cancel them, and query pending/historical option algo orders. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **`option_place_order` now supports attached TP/SL** (`attachAlgoOrds`): Pass `--tpTriggerPx`/`--tpOrdPx` and/or `--slTriggerPx`/`--slOrdPx` to attach a take-profit or stop-loss algo order to the option order in one step. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo` commands**: `place`, `amend`, `cancel`, `orders` — full lifecycle management for option TP/SL algo orders. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **7 new futures core tools** for delivery contract (Phase 1 feature parity with swap): `futures_amend_order`, `futures_close_position`, `futures_set_leverage`, `futures_get_leverage`, `futures_batch_orders`, `futures_batch_amend`, `futures_batch_cancel`. ([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))
- **5 new futures algo tools** (`registerFuturesAlgoTools`): `futures_place_algo_order`, `futures_place_move_stop_order`, `futures_amend_algo_order`, `futures_cancel_algo_orders`, `futures_get_algo_orders`. ([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))

### Fixed

- **Bot tools: added missing parameter descriptions for `algoId`, `algoOrdType`, and `groupId`** — Grid and DCA tools were missing `algoId` descriptions, causing AI agents to pass invalid values (error `51000`) or mismatched `algoOrdType` (error `50016`). Also added `groupId` for `grid_get_sub_orders` and `newSz` for `spot_amend_algo_order`.
- **CLI: `okx bot dca orders` now supports `--algoId` and `--instId` filters** — aligned with `okx bot grid orders` behavior.
- **`swap_get_algo_orders` hardcoded `instType`**: Now accepts an optional `instType` parameter (default `"SWAP"`, accepts `"FUTURES"`). ([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))
- **`callBackRatio` / `callBackSpread` parameter name mismatch**: Fixed capital-B parameter names in POST body for `swap_place_algo_order` and `swap_place_move_stop_order`. MCP input schema names remain unchanged. ([#69](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/69))
- **CLI `algo place` missing trailing stop params**: `callbackRatio`, `callbackSpread`, and `activePx` were silently dropped in `cmdSpotAlgoPlace`, `cmdSwapAlgoPlace`, and `cmdFuturesAlgoPlace`. Now passed through correctly. ([#74](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/74))
- **CLI `okx swap algo cancel` format**: Fixed `cmdSwapAlgoCancel` to wrap args as `{ orders: [{ instId, algoId }] }` matching the tool's required format. ([#76](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/76))

### Deprecated

- **`swap_place_move_stop_order`**: Deprecated in favor of `swap_place_algo_order` with `ordType='move_order_stop'`. The tool remains functional for backward compatibility. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### Changed

- **`--modules all` now includes earn sub-modules**: `all` now expands to every module including `earn.savings`, `earn.onchain`, and `earn.dcd`. Default modules remain unchanged. ([#66](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/66))
- **CLI: removed direct `smol-toml` dependency** — TOML functionality now provided exclusively through `@agent-tradekit/core`. ([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **Deduplicate postinstall script**: `scripts/postinstall-notice.js` at monorepo root is the single source of truth; package copies are generated during `build`. ([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` restructured as sub-module directory** (internal): `earn.ts` → `tools/earn/savings.ts`, `onchain-earn.ts` → `tools/earn/onchain.ts`. No public API changes. ([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))
- **Deduplicate `normalize()` across tool modules**: Removed 9 local copies; all now use shared `normalizeResponse` from `helpers.ts`. ([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **Extract `buildAttachAlgoOrds()` helper**: Shared TP/SL assembly helper in `helpers.ts`, replacing 5 duplicate inline blocks. ([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **Trim tool descriptions**: Removed "Private endpoint", "Public endpoint", and "Rate limit" labels from all tool descriptions to reduce MCP schema token overhead. `[CAUTION]` markers preserved. ([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))

---

## [1.2.4-beta.7] - 2026-03-14

### Fixed

- **CLI `okx swap algo cancel` reports "orders must be a non-empty array"**: `cmdSwapAlgoCancel` was passing `{ instId, algoId }` directly to `swap_cancel_algo_orders`, but the tool requires `{ orders: [{ instId, algoId }] }` format, causing the command to always fail. Fixed to match the wrapping pattern used by `futures`/`option`. ([#76](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/76))

---

## [1.2.4-beta.6] - 2026-03-14

### Fixed

- **CLI `algo place` missing trailing stop params**: `cmdSpotAlgoPlace`, `cmdSwapAlgoPlace`, and `cmdFuturesAlgoPlace` were silently dropping `callbackRatio`, `callbackSpread`, and `activePx` when passed by the user. Placing a trailing stop via `okx {spot,swap,futures} algo place --ordType move_order_stop` would return API error 50015 (missing required param). The three params are now passed through to the tool runner correctly. ([#74](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/74))

---

## [1.2.4-beta.5] - 2026-03-14

### Added

- **4 new option algo core tools** (`registerOptionAlgoTools`): `option_place_algo_order`, `option_amend_algo_order`, `option_cancel_algo_orders`, `option_get_algo_orders`. These let AI agents and users place conditional TP/SL algo orders on option positions, amend or cancel them, and query pending/historical option algo orders. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **`option_place_order` now supports attached TP/SL** (`attachAlgoOrds`): Pass `--tpTriggerPx`/`--tpOrdPx` and/or `--slTriggerPx`/`--slOrdPx` to attach a take-profit or stop-loss algo order to the option order in one step. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo place`**: Place an option TP/SL algo order. Usage: `okx option algo place --instId BTC-USD-250328-95000-C --side sell --ordType oco --sz 1 --tdMode cross --tpTriggerPx 0.006 --tpOrdPx -1 --slTriggerPx 0.003 --slOrdPx -1`. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo amend`**: Amend an existing option algo order's TP/SL levels. Usage: `okx option algo amend --instId BTC-USD-250328-95000-C --algoId <id> [--newTpTriggerPx <p>] [--newSlTriggerPx <p>]`. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo cancel`**: Cancel an option algo order. Usage: `okx option algo cancel --instId BTC-USD-250328-95000-C --algoId <id>`. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo orders`**: List pending or historical option algo orders. Usage: `okx option algo orders [--instId <id>] [--history] [--ordType <conditional|oco>] [--json]`. ([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))

- **7 new futures core tools** for delivery contract (Phase 1 feature parity with swap): `futures_amend_order`, `futures_close_position`, `futures_set_leverage`, `futures_get_leverage`, `futures_batch_orders`, `futures_batch_amend`, `futures_batch_cancel`. These use futures-specific tool names (`futures_*`) instead of reusing swap tools, giving futures its own dedicated API surface. ([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))
- **5 new futures algo tools** (`registerFuturesAlgoTools`): `futures_place_algo_order`, `futures_place_move_stop_order`, `futures_amend_algo_order`, `futures_cancel_algo_orders`, `futures_get_algo_orders`. These are analogues of the swap algo tools but use `instType: "FUTURES"` and are registered under the `futures` module. ([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))

### Fixed

- **`swap_get_algo_orders` hardcoded `instType`**: The tool previously hardcoded `instType: "SWAP"` in the API request body, making it impossible to query FUTURES algo orders. Now accepts an optional `instType` parameter (default `"SWAP"`, accepts `"FUTURES"`). ([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))

### Changed

- **Deduplicate `normalize()` across tool modules**: Removed 9 local `normalize()` copies from `spot-trade`, `swap-trade`, `futures-trade`, `option-trade`, `algo-trade`, `account`, `market`, `bot/grid`, `bot/dca`; all now use the shared `normalizeResponse` from `helpers.ts`. ([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **Extract `buildAttachAlgoOrds()` helper**: Moved the inline TP/SL assembly pattern (`tpTriggerPx`, `tpOrdPx`, `slTriggerPx`, `slOrdPx` → `attachAlgoOrds`) into a shared helper in `helpers.ts`, replacing 5 duplicate blocks in `spot_place_order`, `spot_batch_orders` (place), `swap_place_order`, `swap_batch_orders` (place), and `futures_place_order`. ([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **Trim tool descriptions**: Removed "Private endpoint", "Public endpoint", and "Rate limit: X req/s per UID" labels from all tool description strings to reduce MCP schema token overhead. `[CAUTION]` markers are preserved. ([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))

### Fixed

- **`callBackRatio` / `callBackSpread` parameter name mismatch**: OKX API expects `callBackRatio` and `callBackSpread` (capital B) but the POST body was sending `callbackRatio` and `callbackSpread` (lowercase b), causing sCode 50015 errors. Fixed in `swap_place_algo_order` and `swap_place_move_stop_order` handlers. The MCP input schema parameter names (`callbackRatio` / `callbackSpread`) remain unchanged. ([#69](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/69))

---

## [1.2.4-beta.4] - 2026-03-14

### Added

- **`market_get_stock_tokens` tool**: new dedicated tool to list stock token instruments (e.g. `AAPL-USDT-SWAP`, `TSLA-USDT-SWAP`). Fetches all instruments via `GET /api/v5/public/instruments` and filters client-side by `instCategory=3`. Supports `instType` (default `SWAP`) and optional `instId`. ([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**: new CLI sub-command mapping to `market_get_stock_tokens`. Usage: `okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`. ([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **Spot trailing stop support** (`spot_place_algo_order` with `ordType='move_order_stop'`): `spot_place_algo_order` now supports trailing stop orders in addition to conditional/oco. Pass `ordType='move_order_stop'` with `callbackRatio` (e.g. `'0.01'` for 1%) or `callbackSpread` (fixed price distance), and optionally `activePx`. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`swap_place_algo_order` now supports trailing stop** (`ordType='move_order_stop'`): extended with the same `callbackRatio`, `callbackSpread`, and `activePx` parameters, replacing the need for the deprecated `swap_place_move_stop_order` tool. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`spot_get_algo_orders` now includes trailing stop orders**: When no `ordType` filter is specified, the query now fetches `conditional`, `oco`, and `move_order_stop` orders in parallel. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx spot algo trail`**: New CLI sub-command for placing a spot trailing stop order. Usage: `okx spot algo trail --instId BTC-USDT --side sell --sz 0.001 --callbackRatio 0.01 [--activePx <price>] [--tdMode cash]`. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx futures algo trail`**: New CLI sub-command for placing a futures trailing stop order. Usage: `okx futures algo trail --instId BTC-USD-250328 --side sell --sz 1 --callbackRatio 0.01 [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]`. ([#68](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/68))

### Fixed

- **Bot tools: added missing parameter descriptions for `algoId`, `algoOrdType`, and `groupId`** — Grid tools (`grid_get_orders`, `grid_get_order_details`, `grid_get_sub_orders`, `grid_stop_order`) and DCA tools (`dca_get_orders`, `dca_get_order_details`) were missing `algoId` descriptions, causing AI agents to pass invalid values (error `51000`) or mismatched `algoOrdType` (error `50016`). Also added `groupId` description for `grid_get_sub_orders` and `newSz` description for `spot_amend_algo_order`.
- **CLI: `okx bot dca orders` now supports `--algoId` and `--instId` filters** — Previously the CLI did not pass these parameters to the underlying `dca_get_orders` tool, even though the MCP tool already supported them. Now aligned with `okx bot grid orders` behavior.

### Deprecated

- **`swap_place_move_stop_order`**: Deprecated in favor of `swap_place_algo_order` with `ordType='move_order_stop'`. The tool remains functional for backward compatibility. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### Changed

- **`--modules all` now includes earn sub-modules**: `all` now expands to every module including `earn.savings`, `earn.onchain`, and `earn.dcd`, on par with bot sub-modules. Previously, earn required explicit opt-in via `all,earn`. The default modules remain unchanged. ([#66](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/66))
- **CLI: removed direct `smol-toml` dependency** — `packages/cli` no longer declares `smol-toml` as a direct dependency. The TOML functionality is now provided exclusively through `@agent-tradekit/core`. ([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **Deduplicate postinstall script**: `scripts/postinstall-notice.js` at monorepo root is now the single source of truth. The copies in `packages/cli/scripts/postinstall.js` and `packages/mcp/scripts/postinstall.js` are generated during `build` and ignored by git. ([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` restructured as sub-module directory** (internal): `earn.ts` → `tools/earn/savings.ts`, `onchain-earn.ts` → `tools/earn/onchain.ts`, with a new `tools/earn/index.ts` aggregator. No public API changes. ([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))

---

## [1.2.4-beta.3] - 2026-03-13

### Added

- **CLI `okx futures algo trail`**: New CLI sub-command for placing a futures trailing stop order. Usage: `okx futures algo trail --instId BTC-USD-250328 --side sell --sz 1 --callbackRatio 0.01 [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]`. ([#68](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/68))

---

## [1.2.4-beta.2] - 2026-03-13

### Added

- **Spot trailing stop support** (`spot_place_algo_order` with `ordType='move_order_stop'`): `spot_place_algo_order` now supports trailing stop orders in addition to conditional/oco. Pass `ordType='move_order_stop'` with `callbackRatio` (e.g. `'0.01'` for 1%) or `callbackSpread` (fixed price distance), and optionally `activePx`. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`swap_place_algo_order` now supports trailing stop** (`ordType='move_order_stop'`): The swap algo order tool is extended with the same `callbackRatio`, `callbackSpread`, and `activePx` parameters, replacing the need for the deprecated `swap_place_move_stop_order` tool. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`spot_get_algo_orders` now includes trailing stop orders**: When no `ordType` filter is specified, the query now fetches `conditional`, `oco`, and `move_order_stop` orders in parallel (previously only `conditional` and `oco`). ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx spot algo trail`**: New CLI sub-command for placing a spot trailing stop order. Usage: `okx spot algo trail --instId BTC-USDT --side sell --sz 0.001 --callbackRatio 0.01 [--activePx <price>] [--tdMode cash]`. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### Deprecated

- **`swap_place_move_stop_order`**: Deprecated in favor of `swap_place_algo_order` with `ordType='move_order_stop'`. The tool remains functional for backward compatibility. ([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### Changed

- **`--modules all` now includes earn sub-modules**: `all` now expands to every module including `earn.savings`, `earn.onchain`, and `earn.dcd`, on par with bot sub-modules. Previously, earn required explicit opt-in via `all,earn`. The default modules remain unchanged (`spot`, `swap`, `option`, `account`, `bot.grid`). ([#66](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/66))

---

## [1.2.4-beta.1] - 2026-03-13

### Added

- **`market_get_stock_tokens` tool**: new dedicated tool to list stock token instruments (e.g. `AAPL-USDT-SWAP`, `TSLA-USDT-SWAP`). Fetches all instruments via `GET /api/v5/public/instruments` and filters client-side by `instCategory=3`. Supports `instType` (default `SWAP`) and optional `instId`. ([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**: new CLI sub-command mapping to `market_get_stock_tokens`. Usage: `okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`.
- **DCD module** (`earn.dcd`) — 8 new MCP tools and 10 CLI commands for OKX Dual Currency Deposit (双币赢): `dcd_get_currency_pairs`, `dcd_get_products`, `dcd_request_quote`, `dcd_execute_quote`, `dcd_request_redeem_quote`, `dcd_execute_redeem`, `dcd_get_order_state`, `dcd_get_orders`. CLI: `okx earn dcd pairs`, `products`, `quote`, `buy`, `quote-and-buy`, `redeem-quote`, `redeem`, `redeem-execute`, `order`, `orders`. Supports client-side product filtering (`--minYield`, `--strikeNear`, `--termDays`, `--expDate`), two-step early redemption flow, and demo-mode guard on all write operations.

### Fixed

- **Bot tools: added missing parameter descriptions for `algoId`, `algoOrdType`, and `groupId`** — Grid tools (`grid_get_orders`, `grid_get_order_details`, `grid_get_sub_orders`, `grid_stop_order`) and DCA tools (`dca_get_orders`, `dca_get_order_details`) were missing `algoId` descriptions, causing AI agents to pass invalid values (error `51000`) or mismatched `algoOrdType` (error `50016`). Also added `groupId` description for `grid_get_sub_orders` and `newSz` description for `spot_amend_algo_order`.
- **CLI: `okx bot dca orders` now supports `--algoId` and `--instId` filters** — Previously the CLI did not pass these parameters to the underlying `dca_get_orders` tool, even though the MCP tool already supported them. Now aligned with `okx bot grid orders` behavior.

### Changed

- **CLI: removed direct `smol-toml` dependency** — `packages/cli` no longer declares `smol-toml` as a direct dependency. The TOML functionality is now provided exclusively through `@agent-tradekit/core`, which bundles `smol-toml` internally. ([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **Deduplicate postinstall script**: `scripts/postinstall-notice.js` at monorepo root is now the single source of truth. The copies in `packages/cli/scripts/postinstall.js` and `packages/mcp/scripts/postinstall.js` are generated during `build` and ignored by git. ([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` restructured as sub-module directory** (internal): `earn.ts` → `tools/earn/savings.ts`, `onchain-earn.ts` → `tools/earn/onchain.ts`, with a new `tools/earn/index.ts` aggregator. Consistent with the `bot/` sub-module directory pattern. No public API changes. ([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))

---

## [1.2.4-beta.0] - 2026-03-13

### Added

- **`market_get_stock_tokens` tool**: new dedicated tool to list stock token instruments (e.g. `AAPL-USDT-SWAP`, `TSLA-USDT-SWAP`). Fetches all instruments via `GET /api/v5/public/instruments` and filters client-side by `instCategory=3`. Supports `instType` (default `SWAP`) and optional `instId`. ([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**: new CLI sub-command mapping to `market_get_stock_tokens`. Usage: `okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`.

### Fixed

- **Bot tools: added missing parameter descriptions for `algoId`, `algoOrdType`, and `groupId`** — Grid tools (`grid_get_orders`, `grid_get_order_details`, `grid_get_sub_orders`, `grid_stop_order`) and DCA tools (`dca_get_orders`, `dca_get_order_details`) were missing `algoId` descriptions, causing AI agents to pass invalid values (error `51000`) or mismatched `algoOrdType` (error `50016`). Also added `groupId` description for `grid_get_sub_orders` and `newSz` description for `spot_amend_algo_order`.
- **CLI: `okx bot dca orders` now supports `--algoId` and `--instId` filters** — Previously the CLI did not pass these parameters to the underlying `dca_get_orders` tool, even though the MCP tool already supported them. Now aligned with `okx bot grid orders` behavior.

### Changed

- **CLI: removed direct `smol-toml` dependency** — `packages/cli` no longer declares `smol-toml` as a direct dependency. The TOML functionality is now provided exclusively through `@agent-tradekit/core`, which bundles `smol-toml` internally. ([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **Deduplicate postinstall script**: `scripts/postinstall-notice.js` at monorepo root is now the single source of truth. The copies in `packages/cli/scripts/postinstall.js` and `packages/mcp/scripts/postinstall.js` are generated during `build` and ignored by git. ([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` restructured as sub-module directory** (internal): `earn.ts` → `tools/earn/savings.ts`, `onchain-earn.ts` → `tools/earn/onchain.ts`, with a new `tools/earn/index.ts` aggregator. Consistent with the `bot/` sub-module directory pattern. No public API changes. ([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))

---

## [1.2.3] - 2026-03-12

### Breaking Changes

- **`--modules all` no longer includes earn sub-modules**: Previously, `--modules all` expanded to every module including `earn.savings` and `earn.onchain`. Now `all` only includes base modules and bot sub-modules. To enable earn modules, you must opt in explicitly:
  - `--modules all,earn` — all modules + all earn sub-modules
  - `--modules all,earn.savings` — all modules + Simple Earn only
  - `--modules all,earn.onchain` — all modules + On-chain Earn only
  - `--modules earn` — earn sub-modules only

  **Migration**: if you previously used `--modules all` and relied on earn tools being active, add `,earn` to your configuration: `--modules all,earn`.

### Added

- **DCD module** (`earn.dcd`) — 8 new MCP tools and 10 CLI commands for OKX Dual Currency Deposit (双币赢): `dcd_get_currency_pairs`, `dcd_get_products`, `dcd_request_quote`, `dcd_execute_quote`, `dcd_request_redeem_quote`, `dcd_execute_redeem`, `dcd_get_order_state`, `dcd_get_orders`. CLI: `okx earn dcd pairs`, `products`, `quote`, `buy`, `quote-and-buy`, `redeem-quote`, `redeem`, `redeem-execute`, `order`, `orders`. Supports client-side product filtering (`--minYield`, `--strikeNear`, `--termDays`, `--expDate`), two-step early redemption flow, and demo-mode guard on all write operations.
- **HTTP/HTTPS proxy support**: Configure `proxy_url` in your TOML profile to route all OKX API requests through a proxy server. Supports authenticated proxies via URL credentials (e.g. `http://user:pass@proxy:8080`). Only HTTP/HTTPS proxies are supported; SOCKS is not. ([#53](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/53))
- **CLI `--verbose` flag**: Add `--verbose` to any command to see detailed network request/response info on stderr — method, URL, auth status (key masked), timing, HTTP status, OKX code, and trace ID. Useful for debugging connectivity and auth issues.
- **CLI `okx diagnose` command**: Step-by-step connectivity check that verifies environment (Node.js, OS, shell, locale, timezone, proxy), configuration (credentials, site, base URL), network (DNS → TCP → TLS → public API), and authentication. On failure, shows actionable hints. Prints a copy-paste diagnostic report block for sharing with support.
- **CLI place commands — attached TP/SL**: `okx spot place`, `okx swap place`, and `okx futures place` now accept optional take-profit and stop-loss parameters: `--tpTriggerPx`, `--tpOrdPx`, `--tpTriggerPxType`, `--slTriggerPx`, `--slOrdPx`, `--slTriggerPxType`. These are forwarded directly to the OKX order API as attached TP/SL on the placed order.
- **Earn module** — 7 new tools for OKX Simple Earn (savings/flexible lending): `earn_get_savings_balance`, `earn_savings_purchase`, `earn_savings_redeem`, `earn_set_lending_rate`, `earn_get_lending_history`, `earn_get_lending_rate_summary`, `earn_get_lending_rate_history`. Includes CLI commands, dual-language documentation, and full test coverage.

---

## [1.2.0] - 2026-03-10

### Added

- **Contract DCA — optional parameters**: `--slMode` (stop-loss price type: `limit`/`market`), `--allowReinvest` (reinvest profit into next cycle, default `true`), `--triggerStrategy` (bot start mode: `instant`/`price`/`rsi`), `--triggerPx` (trigger price for `price` strategy). All are optional and only apply to contract DCA create.
- **Contract DCA orders — `instId` filter**: `dca_get_orders` now accepts an optional `--instId` parameter to filter contract DCA bots by instrument (e.g. `BTC-USDT-SWAP`)
- **Contract DCA sub-orders — `cycleId` filter**: `dca_get_sub_orders` now accepts an optional `--cycleId` parameter, allowing querying orders within a specific cycle
- **On-chain Earn module (6 tools)**: new `onchain-earn` module for OKX On-chain Earn (staking/DeFi) products — `onchain_earn_get_offers`, `onchain_earn_purchase`, `onchain_earn_redeem`, `onchain_earn_cancel`, `onchain_earn_get_active_orders`, `onchain_earn_get_order_history`. CLI: `okx earn onchain offers`, `okx earn onchain purchase`, `okx earn onchain redeem`, `okx earn onchain cancel`, `okx earn onchain orders`, `okx earn onchain history`.

### Changed

- **DCA tools now contract-only**: Removed Spot DCA support from all 5 DCA tools (`dca_create_order`, `dca_stop_order`, `dca_get_orders`, `dca_get_order_details`, `dca_get_sub_orders`). The `type` parameter has been removed — all DCA tools now operate exclusively on contract DCA. Spot DCA was removed due to product risk assessment.
- **Agent skill (`okx-cex-bot`) updated for contract-only DCA**: Rewrote `SKILL.md` to remove all Spot DCA references — description, quickstart examples, command index, cross-skill workflows, operation flow, CLI reference (create/stop/orders/details/sub-orders), MCP tool reference, input/output examples, edge cases, and parameter display name tables. DCA sections now document contract-only usage with `--lever`, `--direction` as required params and no `--type` flag.
- **All order placement tools — `tag` parameter removed, auto-injected**: the `tag` field has been removed from all order placement tool input schemas (spot, swap, futures, option, algo, grid). The server now automatically injects `tag: "MCP"` (or `"CLI"` for CLI usage) into every outgoing order request. Users who previously passed a custom `tag` value will no longer be able to override it. Note: DCA bot tools do not inject `tag` as the Contract DCA API does not support this field.

### Fixed

- **Contract DCA `side`/`direction` mismatch** (critical): MCP schema used `side` (`buy`/`sell`) but API requires `direction` (`long`/`short`). The `side` field was removed; `direction` is now used directly. Previously, short positions could not be created correctly.
- **Contract DCA `safetyOrdAmt`, `pxSteps`, `pxStepsMult`, `volMult` conditionally required**: These 4 parameters are business-required when `maxSafetyOrds > 0` (API returns 400 if omitted), but API-optional when `maxSafetyOrds = 0`. They are now schema-optional with descriptions noting the conditional requirement.
- **Contract sub-orders sent unsupported pagination**: contract DCA orders-by-cycle path sent `after`/`before` params, but the API only supports `limit`. Removed `after`/`before` from this path.

---

## [1.1.9] - 2026-03-09

### Changed

- **Spot DCA endpoint paths updated**: all 5 Spot DCA tool endpoints now use the new `/api/v5/tradingBot/spot-dca` base URL and renamed paths (`create`, `stop`, `bot-active-list`, `bot-history-list`, `bot-detail`, `trade-list`), aligning with the backend change in okcoin-bots MR #210. Contract DCA remains on `/api/v5/tradingBot/dca` and is unaffected.
- **`grid_create_order` — `sz` description clarified**: the `sz` parameter description now says "investment amount in margin currency (e.g. USDT for USDT-margined contracts)" instead of "Investment amount in USDT", correctly covering both USDT-margined and coin-margined contract grids. Behavior is unchanged.
- **`--no-basePos` CLI example removed from docs**: the `--no-basePos` flag example has been removed from `docs/cli-reference.md` as `basePos` defaults to `true` and is not exposed as a standalone CLI flag.

### Fixed

- **`dca_create_order` — contract DCA now passes `slPct` and `slMode`**: the `slPct` (stop-loss ratio) and `slMode` (stop-loss price type) parameters were accepted in the schema but not forwarded to the OKX API for contract DCA. This caused stop-loss settings to be silently ignored when creating contract DCA bots. Spot DCA was unaffected. Note: when `slPct` is set for contract DCA, `slMode` (`"limit"` or `"market"`) is required by the OKX API.

---

## [1.1.8] - 2026-03-09

### Changed

- **`grid_create_order` — `basePos` defaults to `true`**: contract grid bots now open a base position by default (long/short direction). Neutral direction ignores this parameter. Pass `basePos: false` (MCP) or `--no-basePos` (CLI) to disable. Spot grid is unaffected.

---

## [1.1.7] - 2026-03-09

### Changed

- Version bump.

---

## [1.1.6] - 2026-03-08

### Changed

- Version bump.

---

## [1.1.5] - 2026-03-08

### Added

- **Multi-level `--help` navigation**: `okx --help`, `okx <module> --help`, and `okx <module> <subgroup> --help` now print scoped help with per-command descriptions, so AI agents can discover available capabilities without reading source code.

### Fixed

- **`--reserveFunds` missing from `bot dca create` help**: the parameter was supported in code but absent from the help output.

---

## [1.1.4] - 2026-03-08

### Fixed

- **`--modules all` now includes `bot.dca`**: previously `all` expanded using `BOT_DEFAULT_SUB_MODULES` (bot.grid only), silently excluding the DCA module. Now correctly uses all bot sub-modules.
- **`option` added to default modules**: the default module set is now `spot, swap, option, account, bot.grid`. MCP server help text updated to match actual defaults.

---

## [1.1.3] - 2026-03-08

### Added

- **Git hash in `--version` output**: both CLI and MCP server now display the build commit hash alongside the version, e.g. `1.1.3 (abc1234)`, making it easy to verify which exact commit a published package was built from

### Fixed

- **Spot `tdMode` not configurable**: `okx spot place`, `okx spot algo place` (TP/SL), MCP `spot_place_algo_order`, and MCP `spot_batch_orders` previously hardcoded `tdMode` with no way to override it. The `--tdMode` flag is now exposed as an optional parameter (default: `cash` for non-margin accounts). Users on unified/margin accounts can pass `--tdMode cross`.

---

## [1.1.2] - 2026-03-08

### Added

- **One-line install scripts**: `install.sh` (macOS/Linux) and `install.ps1` (Windows) — install MCP server + CLI and auto-configure detected MCP clients in one command
- **Auto MCP client configuration**: install script detects and configures Claude Code, Claude Desktop, Cursor, VS Code, and Windsurf automatically
- **`config init --lang`**: `--lang zh` flag for Chinese-language interactive wizard; defaults to English
- **Smart default profile name**: `config init` infers a sensible default profile name from the environment
- **CLI option module**: `okx option` commands for placing, cancelling, amending orders, querying positions, fills, instruments, and Greeks
- **CLI batch operations**: `okx spot batch` and `okx swap batch` for bulk place/cancel/amend
- **CLI audit log**: `okx trade history` to query the local NDJSON audit log
- **CLI contract DCA**: `okx bot dca contract` commands with `--type` flag to distinguish spot vs. contract DCA

### Fixed

- **Version reporting**: MCP server now reads its version from `package.json` at runtime instead of a hardcoded string
- **`okx setup` npx command**: setup config for standalone MCP clients (Claude Desktop, Cursor) now uses `npx` so users don't need a global install
- **Bot write endpoints**: `sCode`/`sMsg` errors from grid and DCA write endpoints are now surfaced correctly instead of being silently swallowed
- **Install script**: installs both `@okx_ai/okx-trade-mcp` and `@okx_ai/okx-trade-cli` (previously only installed one package)

### Changed

- **Bot sub-module refactor**: `bot` module now includes a `bot.default` sub-module; internal sub-module loading is unified and more robust
- **Docs**: one-line install instructions moved from READMEs to `docs/configuration.md`

---

## [1.1.1] - 2026-03-07

### Fixed

- **Build**: `smol-toml` was not bundled into the CLI output despite `noExternal` config — npm registry `1.1.0` shipped with an external `import from "smol-toml"` that fails at runtime. Added `smol-toml` to runtime `dependencies` as a reliable fix and bumped version to republish.

---

## [1.1.0] - 2026-03-07

### Added

- **Contract DCA bot**: `bot.dca` submodule now supports contract (perpetual) DCA in addition to spot — new tools `dca_get_contract_orders`, `dca_get_contract_order_details`, `dca_create_contract_order`, `dca_stop_contract_order`
- **`okx setup` subcommand**: interactive wizard to generate and insert MCP server config into Claude Code, VS Code, Windsurf, and other MCP clients
- **CLI `--version` / `-v` flag**: print the current package version and exit
- **CLI `swap amend` command**: amend an open swap order via the CLI (`okx swap amend`)

### Fixed

- **Duplicate tool**: removed duplicate `swap_amend_order` tool registration that caused the tool to appear twice in tool listings
- **CLI swap amend dispatch**: `okx swap amend` now correctly dispatches to the swap handler instead of the spot handler

### Changed

- **`bot.dca` is opt-in**: the DCA submodule is no longer loaded by default; enable it with `--modules bot.dca` or by adding `bot.dca` to the `modules` list in `~/.okx/config.toml`
- **Bot tools reorganized into submodules**: `bot` module now uses a submodule system — `bot.grid` and `bot.dca` can be loaded independently
- **CLI architecture**: CLI commands now invoke Core tool handlers directly via `ToolRunner`, reducing duplication between MCP and CLI code paths

---

## [1.0.9] - 2026-03-06

### Fixed

- **algo orders**: `swap_get_algo_orders` and `spot_get_algo_orders` now pass the required `state` parameter when querying history (`/api/v5/trade/orders-algo-history`), defaulting to `effective` (#28)

---

## [1.0.8] - 2026-03-06

### Changed

- **npm org rename**: packages moved from `@okx_retail` to `@okx_ai` scope. Please reinstall:
  ```
  npm uninstall -g @okx_retail/okx-trade-mcp @okx_retail/okx-trade-cli
  npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
  ```
  Binary names are unchanged — `okx-trade-mcp` and `okx` still work after reinstall.

---

## [1.0.7] - 2026-03-04

### Added

- **Scenario tests**: added `scripts/scenario-test/` with multi-step integration tests covering stateless read flows (account balance, market data, swap leverage) and stateful write flows (Spot place→query→cancel, Swap set-leverage→place→query→cancel). Stateless scenarios are CI-safe; stateful scenarios require `OKX_DEMO=1`.
- **Multi-site support**: users on OKX Global (`www.okx.com`), EEA (`my.okx.com`), and US (`app.okx.com`) can now configure their site via `--site <global|eea|us>` CLI flag, `OKX_SITE` env var, or `site` field in `~/.okx/config.toml`. The API base URL is automatically derived from the site; explicit `OKX_API_BASE_URL` / `base_url` overrides remain supported for advanced use.
- **`config init` site selection**: the interactive wizard now prompts for site before asking for API key, and opens the correct API management URL for the chosen site.
- **`config show` site display**: the `site` field is now shown for each profile.
- **Region error context**: error suggestions for OKX region-restriction codes (51155, 51734) now include the currently configured site to help users diagnose misconfigured site settings.
- **docs/faq.md**: added "General" section with 3 new Q&As — "What is OKX Trade MCP?", "What trading pairs are supported?", and "What risks should I understand?" (bilingual EN + ZH)
- **docs/faq.md**: added "API Coverage" section explaining which OKX REST API modules are supported vs. not yet supported by the MCP server and CLI (bilingual EN + ZH)

### Fixed

- **CLI**: ensure `main()` is always invoked when executed via npm global symlink; add defensive comment and symlink regression test to prevent future regressions (#21)

### Changed

- **Release prep**: version bump for publish
- **`okx config init`**: site selection (Global / EEA / US) and demo/live choice are now asked upfront; the CLI opens the targeted API creation page with `?go-demo-trading=1` or `?go-live-trading=1` query param so users land directly on the correct tab. EEA (`my.okx.com`) and US (`app.okx.com`) sites are supported and saved as `base_url` in the profile.
- **docs/configuration.md**, **README.md**, **README.zh.md**: updated API key creation links to direct URLs with `?go-demo-trading=1` / `?go-live-trading=1` parameters (bilingual EN + ZH).
- **npm scope**: packages are now published under the `@okx_retail` organisation. Please reinstall:
  ```
  npm uninstall -g okx-trade-mcp okx-trade-cli
  npm install -g @okx_retail/okx-trade-mcp @okx_retail/okx-trade-cli
  ```
  Binary names are unchanged — `okx-trade-mcp` and `okx` still work after reinstall.

---

## [1.0.6] - 2026-03-04

### Added

### Fixed

### Changed

- **Project rename**: internal package `@okx-hub/core` renamed to `@agent-tradekit/core`

---

## [1.0.5] - 2026-03-04

### Added

- **Option module (10 tools)**: new `option` module for options trading — `option_place_order`, `option_cancel_order`, `option_batch_cancel`, `option_amend_order` (write); `option_get_order`, `option_get_orders`, `option_get_positions` (with Greeks), `option_get_fills`, `option_get_instruments` (option chain), `option_get_greeks` (IV + Delta/Gamma/Theta/Vega) (read)

### Fixed

### Changed

- Total tools: 48 → 57 → 67
- **Documentation restructure**: split single `README.md` into `README.md` (EN) + `README.zh.md` (ZH) with language toggle; added `docs/configuration.md` (all client setups + startup scenarios), `docs/faq.md`, `docs/cli-reference.md`, and per-module references under `docs/modules/`
- **GitHub issue templates**: added `bug_report.md` and `feature_request.md` under `.github/ISSUE_TEMPLATE/`
- **`SECURITY.md`**: added supported versions table and GitHub Private Security Advisory link
- **Error handling — actionable suggestions**: `OkxRestClient` now maps ~20 OKX error codes to retry guidance; rate-limit codes (`50011`, `50061`) throw `RateLimitError`; server-busy codes carry "Retry after X seconds"; region/compliance and account-issue codes carry "Do not retry" advice
- **Test coverage**: function coverage raised from 76.5% → 93.4% (199 → 243 tests); every source file now exceeds 80% function coverage
- **Coverage scripts**: c8 now includes `packages/cli/src` and `packages/mcp/src` in coverage collection and runs all package tests

---

## [1.0.4] - 2026-03-03

### Added

- **Audit log — `trade_get_history`**: query the local NDJSON audit log of all MCP tool calls; supports `limit`, `tool`, `level`, and `since` filters
- **Audit logging**: MCP server automatically writes NDJSON entries to `~/.okx/logs/trade-YYYY-MM-DD.log`; `--no-log` disables logging, `--log-level` sets the minimum level (default `info`); sensitive fields (apiKey, secretKey, passphrase) are automatically redacted
- **Error tracing**: `traceId` field added to `ToolErrorPayload` and all error classes — populated from `x-trace-id` / `x-request-id` response headers when OKX returns them
- **Server version in MCP errors**: `serverVersion` injected into MCP error payloads for easier bug reporting
- **CLI version in errors**: `Version: okx-trade-cli@x.x.x` always printed to stderr on error; `TraceId:` printed when available
- **Market — index data**: `market_get_index_ticker`, `market_get_index_candles` (+ history), `market_get_price_limit` (3 new tools)
- **Spot — batch orders**: `spot_batch_orders` — batch place/cancel/amend up to 20 spot orders in one request
- **Spot/Swap — order archive**: `status="archive"` on `spot_get_orders` / `swap_get_orders` → `/trade/orders-history-archive` (up to 3 months)
- **Account — positions**: `account_get_positions` — cross-instType positions query (MARGIN/SWAP/FUTURES/OPTION)
- **Account — bills archive**: `account_get_bills_archive` — archived ledger up to 3 months
- **Account — sizing**: `account_get_max_withdrawal`, `account_get_max_avail_size`
- **README**: "Reporting Issues / 报错反馈" section with example error payloads
- **Grid Bot (module: `bot`)**: 5 new tools for OKX Trading Bot grid strategies — `grid_get_orders`, `grid_get_order_details`, `grid_get_sub_orders` (read), `grid_create_order`, `grid_stop_order` (write). Covers Spot Grid, Contract Grid, and Moon Grid.
- **CLI `--demo` flag**: global `--demo` option to enable simulated trading mode directly from the command line (alternative to `OKX_DEMO=1` env var or profile config)
- **CLI bot grid commands**: `bot grid orders`, `bot grid details`, `bot grid sub-orders`, `bot grid create`, `bot grid stop` — full grid bot lifecycle management via CLI
- **CLI full coverage**: extended `okx-trade-cli` to cover all 57 MCP tools — new commands across `market` (`instruments`, `funding-rate`, `mark-price`, `trades`, `index-ticker`, `index-candles`, `price-limit`, `open-interest`), `account` (`positions`, `bills`, `fees`, `config`, `set-position-mode`, `max-size`, `max-avail-size`, `max-withdrawal`, `positions-history`, `asset-balance`, `transfer`), `spot` (`get`, `amend`), `swap` (`get`, `fills`, `close`, `get-leverage`), and new `futures` module (`orders`, `positions`, `fills`, `place`, `cancel`, `get`)
- **CLI/MCP entry tests**: new unit tests for `okx` and `okx-trade-mcp` entrypoints to exercise help/setup flows and keep coverage accurate

### Fixed

- **Grid bot endpoint paths**: corrected all 5 grid tool endpoints to match OKX API v5 spec — `orders-algo-pending`, `orders-algo-history`, `order-algo`, `stop-order-algo` (previously used wrong paths causing HTTP 404)
- **`grid_stop_order`**: request body now serialized as an array `[{...}]` as required by OKX `stop-order-algo` endpoint
- **`grid_create_order`**: removed spurious `tdMode` parameter (field does not exist in `ApiPlaceGridParam`; was silently ignored by server but polluted the tool schema)
- **`grid_create_order`**: restricted `algoOrdType` enum to `["grid", "contract_grid"]` — server `@StringMatch` validation only accepts these two values for creation; `moon_grid` is valid for queries and stop operations only
- **`grid_stop_order`**: expanded `stopType` enum from `["1","2"]` to `["1","2","3","5","6"]` to match server `StopStrategyParam` validation
- **CLI `bot grid create`**: removed `--tdMode` flag and `algoOrdType` now restricted to `<grid|contract_grid>`, in sync with MCP tool changes
- **CLI `bot grid stop`**: updated `--stopType` hint to `<1|2|3|5|6>`
- **`spot_get_algo_orders`**: fixed `400 Parameter ordType error` when called without an `ordType` filter — now fetches `conditional` and `oco` types in parallel and merges results, matching the behaviour of `swap_get_algo_orders`

### Changed

---

## [1.0.2] - 2026-03-01

### Added

- **Market — 5 new tools**: `market_get_instruments`, `market_get_funding_rate` (+ history), `market_get_mark_price`, `market_get_trades`, `market_get_open_interest`
- **Market — candle history**: `history=true` on `market_get_candles` → `/market/history-candles`
- **Spot/Swap — fills archive**: `archive=true` on `spot_get_fills` / `swap_get_fills` → `/trade/fills-history`
- **Spot/Swap — single order fetch**: `spot_get_order`, `swap_get_order` — fetch by `ordId` / `clOrdId`
- **Swap — close & batch**: `swap_close_position`, `swap_batch_orders` (batch place/cancel/amend up to 20)
- **Swap — leverage query**: `swap_get_leverage`
- **Account — 6 new tools**: `account_get_bills`, `account_get_positions_history`, `account_get_trade_fee`, `account_get_config`, `account_set_position_mode`, `account_get_max_size`
- **Account — funding balance**: `account_get_asset_balance` (funding account, `/asset/balances`)
- **System capabilities tool**: `system_get_capabilities` — machine-readable server capabilities for agent planning
- **MCP client configs**: Claude Code CLI, VS Code, Windsurf, openCxxW setup examples added to README

### Fixed

- Update notifier package names corrected (`okx-trade-mcp`, `okx-trade-cli`)
- CLI typecheck errors resolved (strict `parseArgs` types, `smol-toml` interop)

### Changed

- Total tools: 28 → 43

---

## [1.0.1] - 2026-02-28

### Added

- **Trailing stop order** (`swap_place_move_stop_order`) for SWAP — available in both CLI and MCP server
- **Update notifier** — on startup, prints a notice to stderr when a newer npm version is available

---

## [1.0.0] - 2026-02-28

### Added

- **MCP server** (`okx-trade-mcp`): OKX REST API v5 integration via the Model Context Protocol
- **CLI** (`okx-trade-cli`): command-line trading interface for OKX
- **Modules**:
  - `market` — ticker, orderbook, candles (no credentials required)
  - `spot` — place/cancel/amend orders, algo orders (conditional, OCO), fills, order history
  - `swap` — perpetual order management, positions, leverage, fills, algo orders
  - `account` — balance query, fund transfer
- **Algo orders**: conditional (take-profit / stop-loss) and OCO order pairs for spot and swap
- **CLI flags**: `--modules`, `--read-only`, `--demo`
- **Rate limiter**: client-side token bucket per tool
- **Config**: TOML profile system at `~/.okx/config.toml`
- **Error hierarchy**: `ConfigError`, `ValidationError`, `AuthenticationError`, `RateLimitError`, `OkxApiError`, `NetworkError` with structured MCP error payloads
