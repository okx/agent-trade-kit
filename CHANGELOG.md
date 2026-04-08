[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Skill download `format` parameter**: `skills_download` MCP tool and `okx skill download` CLI command now accept a `format` option (`"zip"` or `"skill"`). MCP defaults to `"skill"` (so agents like Claude Desktop can auto-detect the file type), CLI defaults to `"zip"` (backward-compatible). The file content is identical — only the extension changes.
- **Market tools `demo` parameter**: All 14 market tools now accept an optional `demo: boolean` parameter. When `demo=true`, the request targets OKX's simulated trading market data environment (`x-simulated-trading: 1`). When omitted or `false` (default), live market data is always returned — independent of whether the server is started with `--demo`.

### Fixed

- **Market data defaults to live regardless of server demo mode**: Previously, starting the server with `--demo` caused all market data requests to return simulated trading data. Now market tools explicitly pass `simulatedTrading: false` by default, overriding the server-level demo flag. Users can pass `demo: true` to explicitly query simulated market data. Other modules (trading, account, earn, indicators) are unaffected and continue to follow the server demo flag.
- **Unknown `tgtCcy` values now throw `ValidationError` instead of silent passthrough**: Previously, typos like `--tgtCcy margin_ccy` or `--tgtCcy QUOTE_CCY` were silently ignored and `sz` was sent to the API unconverted. Now only `base_ccy`, `quote_ccy`, and `margin` are accepted; any other value throws a `ValidationError` with a helpful suggestion. (#133)
- **`--verbose` flag now affects CLI audit log output**: Previously, `TradeLogger` was always constructed with `"info"` level and all success logs used `"info"`, so `--verbose` had no effect on log file content. Now, verbose mode sets log level to `"debug"` and writes an additional debug-level entry with full request args and response data for each successful tool call, while non-verbose mode only records a compact summary. (#130)

---

## [1.3.0-beta.2] - 2026-04-07

### Added

- **Simple Earn Fixed (定期赚币) tools** (`earn.savings`): Three new tools — `earn_get_fixed_order_list` (query fixed-term orders by ccy/state), `earn_fixed_purchase` (two-step purchase: preview with offer details then confirm; funds locked until maturity), `earn_fixed_redeem` (redeem a fixed-term order). `earn_get_lending_rate_history` now also returns available fixed-term offers with APR, term, min amount, and remaining quota. CLI: `okx earn savings fixed-orders`, `okx earn savings fixed-purchase`, `okx earn savings fixed-redeem`.
- **Margin-cost order mode (`tgtCcy=margin`)**: New `margin` value for `tgtCcy` parameter on SWAP, FUTURES, and options place/algo order tools. When `tgtCcy=margin`, `sz` represents the USDT margin cost; the system automatically queries the current leverage and converts to the correct number of contracts (formula: `contracts = floor(margin * lever / (ctVal * lastPx))`). Existing `quote_ccy` (notional value) and `base_ccy` (contracts) modes are unchanged. Skills confirmation templates now require explicit disambiguation when a user says "500U" — is it notional value or margin cost? (#128)
- **CLI audit logging**: CLI now writes audit logs to `~/.okx/logs/trade-YYYY-MM-DD.log` for all tool executions, matching MCP server behavior. `okx account audit-log` now works for CLI users. (#129)

### Changed

- **`earn_get_lending_rate_history` now fetches fixed-term offers via authenticated API** (`earn.savings`): This tool now makes an additional `privateGet` call to retrieve fixed-term product offers. The call is best-effort — if the user has no API key configured, the tool still returns flexible lending rate history as before, with an empty `fixedOffers` array.
- **`earn_get_lending_rate_history` default limit reduced from 100 to 7** (`earn.savings`): When `limit` is omitted, the tool now returns the 7 most recent records instead of 100, reducing token usage in agent conversations.

### Fixed

- **CLI `--json` env wrapper is now opt-in via `--env` flag**: Reverts the breaking change from 1.3.0-beta.1 where `--json` output was wrapped in `{env, profile, data}`. Now `--json` returns raw data by default (backward compatible). Use `--json --env` to get the wrapper with environment metadata. Table output environment header is unaffected. (#131)
- **`tgtCcy=quote_ccy` conversion: use `minSz`/`lotSz` instead of `Math.floor`**: The USDT-to-contract conversion now rounds down to `lotSz` precision and compares against `minSz` from the instruments API, instead of assuming integer contracts. Fixes false "too small" errors for instruments where `minSz < 1` (e.g. BTC-USDT-SWAP with `minSz=0.01`). (#127)

---

## [1.3.0-beta.1] - 2026-04-07

### Added

- **`market_list_indicators` MCP tool and `okx market indicator list` CLI command**: List OKX market indicators with filtering by category, page, and limit. Supports range-filter flags (`--fearGreedIndexMin/Max`, `--longShortRatioMin/Max`, etc.) for AI-driven market sentiment screening. (#124)

### Fixed

- **Indicator range-filter code mapping**: Corrected internal code mappings for range-filter parameters and removed indicator types unsupported by the OKX API, preventing silent empty results.
- **Skills docs indicator sync**: Updated all indicator-related descriptions and example outputs in skills docs to match the live backend data schema and new CLI commands.
- **Skills docs account transfer type codes swapped**: Corrected `6`=funding / `18`=trading in portfolio and earn skills documentation — previously written in reverse. (#126)

### Changed

- **CLI `--json` output now includes environment metadata**: `--json` output changed from raw OKX API response to `{"env", "profile", "data"}` wrapper. Scripts using `jq '.[0].field'` must update to `jq '.data[0].field'`. Table output now displays an environment header line (`Environment: live` / `Environment: demo (simulated trading)`). (#207, closes #117)

---

## [1.2.9] - 2026-04-06

### Added

- **Skills Marketplace third-party disclaimer**: Added notices at key trust-decision points (marketplace prompt, install/download descriptions, and CLI install flow) to make clear that listed skills are created by independent third-party developers before installation.

### Fixed

- **SWAP/FUTURES/options `tgtCcy=quote_ccy` auto-conversion**: Order handlers now automatically convert quote-currency amounts (for example, USDT) into contract counts before sending SWAP, FUTURES, and options orders/algo orders to the OKX API, preventing oversized positions caused by treating quote amounts as raw contract size. (#114)
- **`dcd_subscribe` yield threshold comparison**: `annualizedYield` is now converted from decimal to percent before comparing against `minAnnualizedYield`, so threshold filtering works correctly and invalid yield values are rejected.
- **Skills docs `tgtCcy` wording**: Clarified that `tgtCcy` is handled by an internal conversion layer rather than passed through directly to the OKX API, reducing sizing confusion in skills documentation.
- **CLI docs: negative values must use `=` form**: Updated all skill references (swap/futures/spot command docs, workflows, SKILL.md) to use `--tpOrdPx=-1` / `--slOrdPx=-1` instead of the space form, which Node `parseArgs()` misinterprets as a flag. Added notes to parameter tables clarifying this requirement. (#123, closes #115)

---

## [1.2.9-beta.2] - 2026-04-06

### Added

- **Skills Marketplace third-party disclaimer**: Added notices at key trust-decision points (SKILL.md agent prompt, `skills_download` tool description, CLI install output, and module docs) to inform users that skills are created by independent third-party developers before installation.

### Fixed

- **SWAP/FUTURES/options `tgtCcy=quote_ccy` auto-conversion**: when `tgtCcy=quote_ccy` is set on SWAP, FUTURES, or options algo orders, the handler now automatically converts the USDT amount to contract count before sending to the OKX API — preventing silent position amplification where e.g. "100 USDT" became "100 contracts (~$6,700)". Conversion fetches `ctVal` and `lastPx` in parallel and logs a `_conversion` note in the response. (#114)
- **`dcd_subscribe` yield threshold comparison**: OKX API returns `annualizedYield` as a decimal fraction (e.g. `0.18` = 18%), but `minAnnualizedYield` was compared directly against the raw value, causing all yield threshold checks to fail. Now correctly multiplies by 100 before comparison. Also rejects with `INVALID_YIELD_VALUE` when the quote returns a non-numeric yield.
- **DCD tool descriptions**: Added yield unit clarification (`annualizedYield` is decimal, not percent) to `dcd_get_products`, `dcd_get_orders`, and `dcd_subscribe` descriptions to prevent LLM misinterpretation.

---

## [1.2.8] - 2026-04-03

### Added

- **`market_get_instruments_by_category` MCP tool and `okx market instruments-by-category` CLI command**: Discover tradeable instruments by `instCategory` — Stock tokens (3), Metals (4), Commodities (5), Forex (6), Bonds (7). Supersedes `market_get_stock_tokens` for category 3. (#109)
- **Skills Marketplace module** (`skills`): Browse, search, and install AI trading skills. Tools: `skills_get_categories`, `skills_search`, `skills_download`. CLI: `okx skill search/categories/add/download/remove/check/list`. Enabled by default.
- **`--live` flag**: Forces live trading mode even when the active profile has `demo=true`. Mutually exclusive with `--demo`. (#108)
- **Three-channel auto-update** (`okx upgrade`): Supports stable, beta, and latest dist-tag channels with automatic skill version sync after upgrade.
- **`account_get_asset_balance` `showValuation` parameter**: Returns total asset valuation breakdown across all account types (trading, funding, earn, etc.). CLI: `okx account asset-balance --valuation`. (#102)
- **`market_get_candles` historical endpoint auto-routing**: Automatically routes to `/market/history-candles` when `after`/`before` timestamps are older than 2 days. The `history` parameter has been removed; no manual switching required. (#101)
- **`okx-cex-trade` SKILL.md restructured with reference files**: Extracted detailed CLI param tables into `references/spot-commands.md`, `references/swap-commands.md`, `references/futures-commands.md`, `references/options-commands.md`, `references/workflows.md`, `references/templates.md` for lighter agent loading.

### Fixed

- **Contract order placement requires `ctVal` lookup**: `swap_place_order`, `futures_place_order`, and `option_place_order` now mandate calling `market_get_instruments` first to retrieve `ctVal` (contract face value) before placing orders. (#113)
- **`account_get_config` `settleCcy`/`settleCcyList`**: These USDS-contract-only fields are now preserved in the response with added description to avoid AI model misinterpretation.
- **Earn write tools blocked in demo mode**: All earn write operations now return a clear `ConfigError` in simulated trading mode instead of an opaque 500 error from OKX API.
- **`account_get_asset_balance` zero balance display**: Correctly shows `0` instead of "(no data)" when account balance is exactly 0.
- **`--no-demo` flag correctly overrides profile `demo=true`**: Three-state resolution: `--live` forces live, `--demo` forces demo, otherwise profile is consulted. (#108)
- **`okx upgrade` security fixes**: Resolves `npm` via `process.execPath` (S4036), eliminates ReDoS hotspot (S5852), replaces `execSync` with `spawnSync` (S4721).
- **Preflight drift check skipped for prerelease CLI**: Avoids false-positive warnings when local CLI version contains a prerelease suffix.

### Deprecated

- **`market_get_stock_tokens`**: Replaced by `market_get_instruments_by_category` with `instCategory="3"`. Retained for backward compatibility; will be removed in a future major version.
- **`okx market stock-tokens`**: Replaced by `okx market instruments-by-category --instCategory 3`. Retained for backward compatibility; will be removed in a future major version.

### Removed

- **`news` module**: Orbit News API integration removed pending regulatory compliance approval. Will be re-introduced once approval is obtained.

---

## [1.2.8-beta.7] - 2026-04-03

### Removed

- **`news` module removed pending compliance approval**: The Orbit News API integration introduced in [1.2.8-beta.4] has been reverted. All news tools (`news_get_latest`, `news_get_by_coin`, `news_search`, `news_get_detail`, `news_get_domains`, `news_get_coin_sentiment`, `news_get_sentiment_ranking`), CLI commands (`okx news …`), and the `okx-cex-news` agent skill have been removed until regulatory compliance approval is obtained. The `skills` (Skill Marketplace) module is unaffected.

---

## [1.2.8-beta.6] - 2026-04-02

### Fixed

- **Contract order placement now requires `ctVal` lookup first**: `swap_place_order`, `futures_place_order`, and `option_place_order` tool descriptions now include a mandatory precondition to call `market_get_instruments` to retrieve `ctVal` (contract face value) before placing orders. The `sz` parameter description is also clarified with an example (e.g. ETH-USDT-SWAP: 1 contract = 0.1 ETH). `okx-cex-trade` SKILL.md updated with a critical warning section. (#113)
- **`account_get_config`: revert field stripping, add description instead**: The beta.5 fix that stripped `settleCcy`/`settleCcyList` from the response has been reverted. These fields are now preserved and explained in the tool description — they only apply to USDS-margined contracts and can be ignored for standard USDT/coin-margined trading.

---

## [1.2.8-beta.5] - 2026-04-02

### Added

- **`market_get_instruments_by_category` MCP tool and `okx market instruments-by-category` CLI command**: Discover tradeable instruments by `instCategory` — Stock tokens (3, e.g. AAPL-USDT-SWAP), Metals (4, e.g. XAUUSDT-USDT-SWAP), Commodities (5, e.g. OIL-USDT-SWAP), Forex (6, e.g. EURUSDT-USDT-SWAP), Bonds (7, e.g. US30Y-USDT-SWAP). Accepts `--instCategory <3|4|5|6|7>`, optional `--instType` (default SWAP) and `--instId`. Supersedes `market_get_stock_tokens` / `okx market stock-tokens` for category 3. (#109)
- **`okx-cex-market` skill updated**: Description, command index, instrument-commands reference, and workflows updated to cover all non-crypto asset categories. New "Non-crypto asset discovery" workflow guides agents from instrument discovery → price check → order sizing. (#109)
- **Skills Marketplace module** (`skills`): Browse, search, and install AI trading skills from the OKX Skills Marketplace. Enabled by default. Activate with `--modules skills`.
  - `skills_get_categories` — List all available skill categories; use `categoryId` as input to `skills_search`.
  - `skills_search` — Search skills by keyword and/or category; returns `totalPage` for pagination.
  - `skills_download` — Download a skill zip to a local directory.
  - CLI: `okx skill search <keyword>`, `okx skill categories`, `okx skill add <name>`, `okx skill download <name> [--dir]`, `okx skill remove <name>`, `okx skill check <name>`, `okx skill list`.
  - `okx skill add` automatically extracts, validates `SKILL.md`, runs `npx skills add`, and records the install in `~/.okx/skills/registry.json`.
  - Agent Skill: `skills/okx-cex-skill-mp/SKILL.md`.

### Deprecated
- **`market_get_stock_tokens` MCP tool**: Replaced by `market_get_instruments_by_category` with `instCategory="3"`. Retained for backward compatibility; will be removed in a future major version.
- **`okx market stock-tokens` CLI command**: Replaced by `okx market instruments-by-category --instCategory 3`. Retained for backward compatibility; will be removed in a future major version.

### Fixed

- **Earn module: write operations now return a clear error in simulated trading (demo) mode** instead of hitting OKX API and receiving an opaque 500 server error. A unified `withDemoGuard` wrapper in `earn/index.ts` intercepts all earn write tools (savings purchase/redeem, DCD subscribe, on-chain staking, auto-earn) before execution and throws a `ConfigError` with the message: "Earn features (savings, DCD, on-chain staking, auto-earn) are not available in simulated trading mode." — with suggestion to switch to a live account. Read-only tools (balance queries, rate history, offer listings) remain accessible in demo mode. `dcd_redeem` preview mode (no `quoteId`, read-only price check) is also permitted. New earn tools added in the future are automatically protected based on their `isWrite` flag.
- **`account_get_config` response strips `settleCcy` / `settleCcyList`**: These USDS-contract-only fields are now removed from the response to avoid confusing AI models that interpret them as general account settings. *(Reverted in [1.2.8-beta.6] — fields are preserved with added description instead.)*

---

## [1.2.8-beta.4] - 2026-04-02

### Added

- **`news` module** (7 tools): Real-time crypto news, full-text search, and sentiment analytics via Orbit News API. All tools are read-only and require no fund permissions. Activate with `--modules news`.
  - `news_get_latest` — Latest news sorted by time; supports importance filter (`high`/`medium`/`low`), coin filter, language, pagination.
  - `news_get_by_coin` — News for specific coins (comma-separated, e.g. `BTC,ETH`).
  - `news_search` — Full-text keyword search with optional coin, importance, sentiment, and sort filters.
  - `news_get_detail` — Full article content (title + AI summary + original text) by news ID.
  - `news_get_domains` — List available news source domains (e.g. CoinDesk, CoinTelegraph).
  - `news_get_coin_sentiment` — Bullish/bearish snapshot or time-series trend for coins; pass `trendPoints` for trend mode.
  - `news_get_sentiment_ranking` — Rank coins by hotness or sentiment direction.
  - CLI: `okx news latest`, `okx news by-coin <coins>`, `okx news search <keyword>`, `okx news detail <id>`, `okx news domains`, `okx news sentiment <coins>`, `okx news sentiment-ranking`.
  - Agent Skill: `skills/okx-cex-news/` with workflows guide.

### Added

- **`--live` flag for CLI and MCP server**: Forces live trading mode even when the active profile has `demo=true`. Mutually exclusive with `--demo` (passing both throws an error). CLI: `okx --live <module> <action>`. MCP: `--live` argument. (#108)

### Fixed
- **`--no-demo` flag now correctly overrides profile `demo=true`**: Previously, `cli.demo` was treated as always-truthy when the default was `false`, so `--no-demo` had no effect against a profile with `demo=true`. The resolution logic now uses a three-state check: `--live` forces live, `--demo` forces demo, otherwise env vars and profile are consulted. (#108)

---

## [1.2.8-beta.3] - 2026-04-01

### Added

- **Three-channel auto-update with skill version sync** (`okx upgrade`): Supports stable, beta, and latest dist-tag channels. Automatically syncs bundled agent-skills version after upgrade. Exports `fetchLatestVersion`, `isNewerVersion`, `fetchDistTags` from core for version resolution.
- **`okx-cex-trade` SKILL.md restructured with separate reference files**: Reduced the monolithic 1,594-line `SKILL.md` to a lean 342-line index by extracting CLI param tables and workflows into `references/spot-commands.md`, `references/swap-commands.md`, `references/futures-commands.md`, `references/options-commands.md`, `references/workflows.md`, and `references/templates.md`. Follows the same pattern as `okx-cex-earn` and `okx-cex-market`. Agents can dynamically load only the reference sections they need.

### Fixed

- **`okx upgrade`: resolve `npm` via `process.execPath`** instead of relying on `PATH` lookup, fixing upgrade failures in environments where `npm` is not on PATH (SonarQube S4036).
- **`okx upgrade`: eliminate ReDoS hotspot** — replaced regex-based string replace with `split`/`join` (SonarQube S5852).
- **`okx upgrade`: replace `execSync` with `spawnSync`** to silence security hotspot (SonarQube S4721).
- **Preflight drift check skipped for prerelease CLI**: When the local CLI version contains a prerelease suffix (e.g. `1.2.8-beta.3`), the version drift check is now skipped to avoid false-positive warnings.

---

## [1.2.8-beta.2] - 2026-03-31

### Fixed

- **`account_get_asset_balance` shows zero balance instead of "(no data)"**: When an account balance is exactly 0, the CLI now correctly displays `0` rather than the placeholder "(no data)" text.

### Changed

- **`market_get_candles` now automatically routes to historical endpoint**: Automatically uses `/market/history-candles` when `after`/`before` timestamps are older than 2 days, enabling access to candlestick data back to 2021. Includes fallback: if the recent endpoint returns empty data for a timestamped request, it retries the history endpoint. The `history` parameter has been removed; no manual switching required. CLI: `okx market candles BTC-USDT --after <timestamp>`. (#101)
- **`account_get_asset_balance` now supports `showValuation` parameter**: Set `showValuation=true` to also return total asset valuation breakdown across all account types (trading, funding, earn, etc.) via `/api/v5/asset/asset-valuation`. Default behavior is unchanged (backward compatible). CLI: `okx account asset-balance --valuation`. (#102)

---

## [1.2.8-beta.1] - 2026-03-31

### Added

- **DoH (DNS-over-HTTPS) node resolution infrastructure** *(experimental — code was subsequently removed from the codebase via merge conflict and is not included in the stable 1.2.8 release)*: Introduced `packages/core/src/doh/` with `DohNode` type and `resolveDoh()` resolver. The REST client integrated DoH-based proxy node selection for improved connectivity in restricted network environments. Removed pending platform-specific native binary integration (`@okx_ai/doh-darwin`, `doh-linux`, `doh-win32`).

---

## [1.2.7] - 2026-03-27

### Added

- **`earn_auto_set` tool** (`earn.autoearn`): Enable or disable auto-earn for a currency. Supports `earnType='0'` for auto-lend+stake (most currencies) and `earnType='1'` for USDG earn (USDG, BUIDL). Cannot disable within 24 hours of enabling. CLI: `okx earn auto on <ccy>` / `okx earn auto off <ccy>`.
- **Contract grid supports coin-margined (inverse) instruments** (e.g. `BTC-USD-SWAP`): Updated `grid_create_order`, `grid_get_orders`, and `grid_stop_order` tool descriptions to document CoinM support, including coin-margined instId examples and margin unit clarification.
- **`grid_create_order` TP/SL params**: Added `tpTriggerPx`, `slTriggerPx` (trigger price) and `tpRatio`, `slRatio` (ratio-based, contract only) so users can set take-profit and stop-loss when creating a grid bot.
- **`grid_create_order` `algoClOrdId`**: User-defined algo order ID (alphanumeric, max 32 chars). Unique per user — enables idempotent creation and can be used to query or stop the bot later.
- **`tgtCcy` parameter for algo place orders**: `spot_place_algo_order`, `swap_place_algo_order`, `futures_place_algo_order`, and `option_place_algo_order` now accept `tgtCcy`. Set `tgtCcy=quote_ccy` to specify order size in USDT instead of contracts/base currency. (#86)
- **`okx diagnose --mcp` multi-client detection**: Detects Cursor, Windsurf, Claude Code, and Claude Desktop configs; skips missing clients instead of failing; passes when at least one client is configured. (#90)
- **`okx diagnose --mcp` tool count limit check**: Warns when total tool count exceeds known client limits (e.g. Cursor: 40/server, 80 total) and suggests `--modules` to reduce. (#90)
- **Cursor tool limit guidance**: Added warning, recommended module combinations table, and safe configuration examples to `docs/configuration.md` and `docs/faq.md` for Cursor users affected by the ~40 tools/server limit. (#88)
- **Spot DCA support** (`bot.dca`): All 5 DCA tools now support both Spot DCA (`algoOrdType=spot_dca`) and Contract DCA (`algoOrdType=contract_dca`). New parameters: `algoOrdType` (required), `algoClOrdId`, `reserveFunds`, `tradeQuoteCcy` for `dca_create_order`; `algoOrdType` and `stopType` for `dca_stop_order`; `algoOrdType` filter for `dca_get_orders`; `algoOrdType` required for `dca_get_order_details` and `dca_get_sub_orders`. CLI commands updated with matching `--algoOrdType` option (defaults to `contract_dca` for backward compatibility).
- **`dca_create_order` RSI trigger support**: `triggerStrategy` now accepts `"rsi"` for both spot and contract DCA. New RSI parameters: `triggerCond` (`cross_up` | `cross_down`), `thold` (RSI threshold, e.g. `"30"`), `timeframe` (e.g. `"15m"`), `timePeriod` (default `"14"`). Note: `price` trigger is only supported for `contract_dca`; `spot_dca` supports `instant` and `rsi` only.
- **Agent Skills bundled in `skills/`**: All 5 skill modules (`okx-cex-market`, `okx-cex-trade`, `okx-cex-portfolio`, `okx-cex-bot`, `okx-cex-earn`) are now included directly in the repository under `skills/`. Includes `skills/README.md` and `skills/README.zh-CN.md` with usage guide.

### Fixed

- **`dca_create_order` missing `tag` field**: The `tag` field (from `context.config.sourceTag`) is now correctly included in the create request body, matching `grid_create_order` behavior.
- **`allowReinvest` type mismatch**: Schema changed from string enum to boolean to match the backend `Boolean` type. Handler accepts both boolean and string "true"/"false" for CLI compatibility.
- **`cmdDcaSubOrders` wrong table columns**: When querying orders within a cycle (with `--cycleId`), the CLI now displays order-specific fields (`ordId`, `side`, `ordType`, `filledSz`, etc.) instead of cycle-list fields.
- **`okx market ticker` showed wrong "24h change %" field**: The field was incorrectly mapped to `sodUtc8` (UTC+8 daily open price) instead of being calculated from `open24h`. Now correctly displays `24h open` (the `open24h` value) and a computed `24h change %` (derived from `open24h` and `last`).
- **`dca_create_order` `triggerStrategy` validation by `algoOrdType`**: `price` trigger is rejected for `spot_dca` at validation time with a clear error message.

### Changed

- **`grid_create_order`: `direction` is now required for contract grids** — MCP-side validation rejects requests missing `direction` when `algoOrdType=contract_grid`, providing immediate client-side feedback without a network round-trip.
- **`grid_stop_order`: default `stopType` changed from `"2"` to `"1"`** — omitting `stopType` now defaults to close-all (stop grid and close positions) instead of keep-assets, which is the safer and more intuitive default for both spot and contract grids.
- **`grid_create_order`: shortened tool descriptions** — reduced `grid_create_order` JSON schema size by ~20% (2,017 → 1,610 chars) by tightening parameter descriptions without removing any information.
- **README updated with Agent Skills section**: Features table and Documentation table updated to reflect the bundled `skills/` directory.

---

## [1.2.7-beta.3] - 2026-03-27

### Added

- **`dca_create_order` RSI trigger support**: `triggerStrategy` now accepts `"rsi"` for both spot and contract DCA. New RSI parameters: `triggerCond` (`cross_up` | `cross_down`), `thold` (RSI threshold, e.g. `"30"`), `timeframe` (e.g. `"15m"`), `timePeriod` (default `"14"`). RSI trigger is supported by both `spot_dca` and `contract_dca`.
- **Agent Skills bundled in `skills/`**: All 5 skill modules (`okx-cex-market`, `okx-cex-trade`, `okx-cex-portfolio`, `okx-cex-bot`, `okx-cex-earn`) are now included directly in the repository under `skills/`. Includes `skills/README.md` and `skills/README.zh-CN.md` with usage guide.

### Fixed

- **`dca_create_order` `triggerStrategy` validation by `algoOrdType`**: `price` trigger is now rejected for `spot_dca` at validation time with a clear error message (`spot_dca` supports `instant` and `rsi` only). `contract_dca` continues to support all three strategies (`instant`, `price`, `rsi`).

### Changed

- **README updated with Agent Skills section**: Features table and Documentation table updated to reflect the bundled `skills/` directory.

---

## [1.2.7-beta.2] - 2026-03-27

### Added

- **`okx diagnose --mcp` multi-client detection**: detects Cursor, Windsurf, Claude Code, and Claude Desktop configs; skips missing clients instead of failing; passes when at least one client is configured (#90)
- **`okx diagnose --mcp` tool count limit check**: warns when total tool count exceeds known client limits (e.g. Cursor: 40/server, 80 total) and suggests `--modules` to reduce (#90)
- **Cursor tool limit guidance**: added warning, recommended module combinations table, and safe configuration examples to `docs/configuration.md` and `docs/faq.md` for Cursor users affected by the ~40 tools/server limit (#88)
- **Spot DCA support** (`bot.dca`): All 5 DCA tools now support both Spot DCA (`algoOrdType=spot_dca`) and Contract DCA (`algoOrdType=contract_dca`). New parameters: `algoOrdType` (required), `algoClOrdId`, `reserveFunds`, `tradeQuoteCcy` for `dca_create_order`; `algoOrdType` and `stopType` for `dca_stop_order`; `algoOrdType` filter for `dca_get_orders`; `algoOrdType` required for `dca_get_order_details` and `dca_get_sub_orders`. CLI commands updated with matching `--algoOrdType` option (defaults to `contract_dca` for backward compatibility). Help text and agent-skills documentation updated.

### Removed

- **`dca_create_order` `triggerStrategy` no longer supports `"rsi"`**: OKX DCA API does not support RSI trigger for DCA bots. The `triggerStrategy` enum is now `["instant", "price"]`. Users previously passing `triggerStrategy: "rsi"` will receive a schema validation error.

### Fixed

- **`dca_create_order` missing `tag` field**: The `tag` field (from `context.config.sourceTag`) is now correctly included in the create request body, matching `grid_create_order` behavior.
- **`allowReinvest` type mismatch**: Schema changed from string enum to boolean to match the backend `Boolean` type. Handler accepts both boolean and string "true"/"false" for CLI compatibility.
- **`cmdDcaSubOrders` wrong table columns**: When querying orders within a cycle (with `--cycleId`), the CLI now displays order-specific fields (`ordId`, `side`, `ordType`, `filledSz`, etc.) instead of cycle-list fields.
- **`okx market ticker` showed wrong "24h change %" field**: The field was incorrectly mapped to `sodUtc8` (UTC+8 daily open price) instead of being calculated from `open24h`. Now correctly displays `24h open` (the `open24h` value) and a computed `24h change %` (derived from `open24h` and `last`).

---

## [1.2.7-beta.1] - 2026-03-26

### Added

- **`earn_auto_set` tool** (`earn.autoearn`): Enable or disable auto-earn for a currency. Supports `earnType='0'` for auto-lend+stake (most currencies) and `earnType='1'` for USDG earn (USDG, BUIDL). Cannot disable within 24 hours of enabling. CLI: `okx earn auto on <ccy>` / `okx earn auto off <ccy>`.
- **Contract grid now supports coin-margined (inverse) instruments** (e.g. `BTC-USD-SWAP`): Updated `grid_create_order`, `grid_get_orders`, and `grid_stop_order` tool descriptions to document CoinM support, including coin-margined instId examples and margin unit clarification.
- **`grid_create_order` now supports TP/SL params**: Added `tpTriggerPx`, `slTriggerPx` (trigger price) and `tpRatio`, `slRatio` (ratio-based, contract only) so users can set take-profit and stop-loss when creating a grid bot.
- **`grid_create_order` now supports `algoClOrdId`**: User-defined algo order ID (alphanumeric, max 32 chars). Unique per user — enables idempotent creation and can be used to query or stop the bot later.
- **`tgtCcy` parameter for algo place orders**: `spot_place_algo_order`, `swap_place_algo_order`, `futures_place_algo_order`, and `option_place_algo_order` now accept `tgtCcy`. Set `tgtCcy=quote_ccy` to specify order size in USDT instead of contracts/base currency, consistent with regular place order tools added in v1.2.6. (#86)

### Changed

- **`grid_create_order`: `direction` is now required for contract grids** — MCP-side validation rejects requests missing `direction` when `algoOrdType=contract_grid`, providing immediate client-side feedback without a network round-trip.
- **`grid_stop_order`: default `stopType` changed from `"2"` to `"1"`** — omitting `stopType` now defaults to close-all (stop grid and close positions) instead of keep-assets, which is the safer and more intuitive default for both spot and contract grids.
- **`grid_create_order`: shortened tool descriptions** — reduced `grid_create_order` JSON schema size by ~20% (2,017 → 1,610 chars) by tightening parameter descriptions (`sz`, `algoClOrdId`, TP/SL fields) without removing any information.
---

## [1.2.6] - 2026-03-23

### Added

- **`market_get_indicator` tool** (`market`): Query technical indicator values for any instrument via the OKX AIGC indicator API. Supports 70+ indicators across 10 categories — moving averages (MA, EMA, WMA, HMA…), trend (MACD, SuperTrend, SAR, ADX…), Ichimoku, momentum oscillators (RSI, KDJ, StochRSI…), volatility (BB, ATR, Keltner…), volume (OBV, VWAP, MFI…), statistics (LR, Slope, Sigma…), price auxiliary (TP, MP), candlestick patterns (15 types), and BTC crypto-cycle indicators (BTCRAINBOW, AHR999). No API credentials required. Accepts optional `params`, `returnList`, `limit`, and `backtestTime`. CLI: `okx market indicator <name> <instId> [--bar <tf>] [--params <p1,p2>] [--list] [--limit N] [--backtest-time <ms>]`.
- **`publicPost()` on `OkxRestClient`**: New unauthenticated POST method, symmetric with `publicGet`. Used internally by `market_get_indicator`.
- **`tgtCcy` parameter for place orders**: `spot_place_order`, `swap_place_order`, and `futures_place_order` now accept `tgtCcy`. Set `tgtCcy=quote_ccy` to specify order size in USDT instead of contracts/base currency.

### Fixed

- **CLI exits with code 1 on OKX business failure**: Write endpoints return HTTP 200 even when an order is rejected (e.g. `sCode="51008"`). The CLI now sets `process.exitCode = 1` when any item in the response has a non-zero `sCode`, making failures detectable by scripts and LLMs via exit code alone.
- **Friendly error for `config.toml` passphrase with special characters**: When a passphrase contains `#`, `\`, `"`, or `'`, the error now includes TOML quoting guidance instead of a cryptic parse error.
- **Insufficient balance errors now hint to check funding account**: Error codes `51008` (insufficient balance), `51119` (insufficient margin), and `51127` (insufficient available margin) now include a suggestion to check the funding account via `account_get_asset_balance` and transfer with `account_transfer (from=18, to=6)`.

### Changed

- **CLI output layer abstracted** (internal): Raw `process.stdout`/`stderr` writes unified behind an output abstraction. No user-facing behavior change.

---

## [1.2.5] - 2026-03-18

### Added

- **`dcd_subscribe` tool** (`earn.dcd`): atomic DCD subscription that requests a quote and executes it in a single step, eliminating quote-expiry race conditions for MCP users. Accepts optional `minAnnualizedYield` (in percent) — if the actual quote yield falls below this threshold, the order is rejected before execution. Returns the trade result with a quote snapshot (`annualizedYield`, `absYield`). Not supported in demo mode.
- **`dcd_redeem` tool** (`earn.dcd`): two-step early redemption designed for user confirmation before executing. First call (no `quoteId`): requests a redemption quote showing the early-exit cost. Second call (with `quoteId`): executes the redemption. If the quote has expired between the two calls, a fresh quote is automatically requested and executed atomically; response includes `autoRefreshedQuote: true`. Not supported in demo mode for the execute step.
- **CLI `okx diagnose --mcp`**: New MCP server troubleshooting mode. Checks package versions, Node.js compatibility, MCP entry-point existence and executability, Claude Desktop `mcpServers` configuration, recent MCP log tail, module-load smoke test (`--version`), and a live stdio JSON-RPC handshake (5 s timeout). Zero external dependencies — uses Node.js built-ins only.
- **`--output <file>` for `okx diagnose`**: Both the default and `--mcp` modes now accept `--output <path>` to save the diagnostic report to a file for sharing.
- **`allToolSpecs()` exported from `@agent-tradekit/core`**: The function is now part of the public API, exposed for future external consumers that need to enumerate all registered tool specs.

### Removed

- **Low-level DCD split tools removed**: `dcd_request_quote`, `dcd_execute_quote`, `dcd_request_redeem_quote`, and `dcd_execute_redeem` have been removed. Use `dcd_subscribe` for subscribe flows and `dcd_redeem` for early redemption flows.
- **`earn_get_lending_rate_summary` tool removed** (`earn.savings`): The lending market rate summary endpoint has been removed from the MCP tool set. Use `earn_get_lending_rate_history` to query market lending rates instead.

### Fixed

- **Tool description semantics for `rate` / `lendingRate` in Simple Earn tools**: Corrected misleading descriptions in `earn_get_savings_balance`, `earn_set_lending_rate`, `earn_get_lending_history`, and `earn_get_lending_rate_history`. The `rate` field is now clearly described as a *minimum lending rate threshold* (not market yield, not APY). The `lendingRate` field now documents the pro-rata dilution mechanism for stablecoins (USDT/USDC): when eligible supply exceeds borrowing demand, total interest is shared among all lenders so `lendingRate` < `rate`; for non-stablecoins, `lendingRate` equals `rate` with no dilution. Users should always use `lendingRate` as the true APY.
- **CLI `cancel` commands now support `--clOrdId`**: `okx spot/swap/futures cancel` previously required `--ordId` as a positional argument. Now accepts either `--ordId` or `--clOrdId` (client order ID); throws a clear error if neither is provided. Affects `spot_cancel_order`, `swap_cancel_order`, `futures_cancel_order`.
- **CLI `spot/swap/futures cancel` was ignoring `--instId` flag**: `cmdSpotCancel`, `cmdSwapCancel`, and `cmdFuturesCancel` used the positional argument (`rest[0]`) as `instId` instead of the `--instId` flag value, causing the cancel to silently use the wrong instrument ID. Fixed to correctly pass `v.instId`.

### Changed

- **Tool descriptions optimized across all modules**: Removed "Private endpoint", "Public endpoint", and "Rate limit" labels from all tool description strings to reduce MCP schema token overhead. Shortened descriptions for earn, grid, DCA, swap/futures/option modules. `[CAUTION]` markers preserved.
- **TWAP bot moved to CLI-only**: `bot.twap` MCP tools removed; TWAP functionality remains available via `okx bot twap` CLI commands.
- **`sanitize()` utility**: Masks UUIDs, long hex strings (≥32 chars), and Bearer tokens in diagnostic output before sharing.
- **`diagnose-utils.ts`** (internal): Shared `Report`, `ok`, `fail`, `section`, and `sanitize` helpers extracted from `diagnose.ts` to enable reuse by `diagnose-mcp.ts`.
- **File-level comments added** to all tools modules (internal documentation).

---

## [1.2.5-beta.5] - 2026-03-17

### Fixed

- **CLI `cancel` commands now support `--clOrdId`**: `okx spot/swap/futures cancel` previously required `--ordId` as a positional argument. Now accepts either `--ordId` or `--clOrdId` (client order ID); throws a clear error if neither is provided. Affects `spot_cancel_order`, `swap_cancel_order`, `futures_cancel_order`.

---

## [1.2.5-beta.4] - 2026-03-17

### Removed

- **`feat/add-more-bots-phase-1` reverted**: Removed all changes introduced by this branch, including bug fixes that are a side effect of the revert:
  - `dca_create_order` RSI trigger sub-parameters (`triggerCond`, `thold`, `timePeriod`, `timeframe`) and copy-trading params (`trackingMode`, `profitSharingRatio`)
  - 5 DCA CLI commands: `margin-add`, `margin-reduce`, `set-tp`, `set-reinvest`, `manual-buy`
  - Spot Recurring Buy CLI commands: `okx bot recurring create|amend|stop|orders|details|sub-orders`
  - `grid_create_order` 6 new optional parameters (`tpTriggerPx`, `slTriggerPx`, `algoClOrdId`, `tradeQuoteCcy`, `tpRatio`, `slRatio`)
  - 14 new grid CLI commands (`amend-basic-param`, `amend-order`, `close-position`, `cancel-close-order`, `instant-trigger`, `positions`, `withdraw-income`, `compute-margin-balance`, `margin-balance`, `adjust-investment`, `ai-param`, `min-investment`, `rsi-back-testing`, `max-quantity`)
  - TWAP CLI commands: `okx bot twap place|cancel|orders|details`
  - *(side effect)* **`swap_cancel_algo_orders` input format restored**: the branch had broken the input schema from `{ orders: [{ algoId, instId }] }` to flat `{ instId, algoId }`; revert restores correct format.
  - *(side effect)* **`dca_create_order` `pxStepsMult`/`volMult` threshold corrected**: the branch had misdocumented the required threshold as `maxSafetyOrds > 1`; revert restores correct `> 0`.

---

## [1.2.5-beta.3] - 2026-03-17

### Removed

- **`copytrading` module reverted**: Removed the 5 CLI copy-trading commands (`traders`, `trader-detail`, `status`, `follow`, `unfollow`), the `copytrading` MCP tool, related documentation (`docs/cli-reference.md` copytrading section), and README copy-trading entries introduced in v1.2.5-beta.2.

---

## [1.2.5-beta.2] - 2026-03-17

### Added

- **`dcd_subscribe` tool** (`earn.dcd`): atomic DCD subscription that requests a quote and executes it in a single step, eliminating quote-expiry race conditions for MCP users. Accepts optional `minAnnualizedYield` (in percent) — if the actual quote yield falls below this threshold, the order is rejected before execution. Returns the trade result with a quote snapshot (`annualizedYield`, `absYield`). Not supported in demo mode.
- **`dcd_redeem` tool** (`earn.dcd`): two-step early redemption designed for user confirmation before executing. First call (no `quoteId`): requests a redemption quote showing the early-exit cost. Second call (with `quoteId`): executes the redemption. If the quote has expired between the two calls, a fresh quote is automatically requested and executed atomically; response includes `autoRefreshedQuote: true`. Not supported in demo mode for the execute step.
- **Removed low-level split DCD tools**: `dcd_request_quote`, `dcd_execute_quote`, `dcd_request_redeem_quote`, and `dcd_execute_redeem` have been removed. Use `dcd_subscribe` for subscribe flows and `dcd_redeem` for early redemption flows.

### Changed

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
