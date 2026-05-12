[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Pair spread tool** (`market_get_pair_spread`). Compute spread statistics (mean/stdDev/median/min/max for both absolute and ratio) between two instruments over a configurable lookback window. Supports backtest mode. CLI command: `okx market pair-spread`. No credentials required.

## [1.3.4-beta.1] - 2026-05-12

### Added

- **Economic calendar tools** (`news_get_economic_calendar`, `news_list_calendar_regions`). Query macro-economic events (GDP, CPI, NFP, FOMC, etc.) with region/importance filters and time-window controls. CLI commands: `okx news economic-calendar`, `okx news list-regions`. Skill `okx-sentiment-tracker` updated with calendar workflow guidance.

## [1.3.3] - 2026-05-08

Stable rollup of `1.3.3-beta.1` → `1.3.3-beta.3`. See per-beta sections below for full implementation detail.

### ⚠ BREAKING

- **`smartmoney` module redesign — no compat shim** (1.3.3-beta.1, !304). MCP/CLI surface fully rewritten for AI-agent disambiguation: 8 → 10 atomic tools (`get_traders_by_filter`, `get_performance_by_trader`, `get_trader_orders_history`, `get_trader_positions`, `get_trader_positions_history`, `get_signal_overview_by_filter`, `get_signal_overview_by_trader`, `get_signal_trend_by_filter`, `get_signal_trend_by_trader`, `search_trader`). Old tool/parameter/field names removed. Arrays replace CSV strings for `authorIds` / `instCcyList`. Pool-filter rename (`pnl`/`winRate`/`asset` → `minPnl`/`minWinRate`/`minAum`). Output field renames (`winRatio` → `winRate`, `maxRetreat` → `maxDrawdown`). Full migration guide: [`docs/designs/smartmoney.md`](docs/designs/smartmoney.md).

### Added

- **Windows named-pipe OAuth token retrieval for `okx auth`** (`packages/core/src/auth/`, !310). Eliminates the WSL/elevated-privilege requirement on Windows; tokens are fetched via a per-invocation named pipe (`\\.\pipe\okx-auth-<256-bit-random>`) instead of fd-3 forwarding.
- **`--tpLevel` multi-tier take-profit flag (Phase 3b)** (!292, #183). Repeatable on `okx {swap,spot,futures} place` and `algo place` for independent TP tiers. CLI-only (not exposed in MCP / skill workflows).
- **Phase 3a+c CLI power-user flags** (!291, #182). Six new optional flags: `--tpTriggerRatio` / `--slTriggerRatio` (ratio-based TP/SL triggers), `--closeFraction` (partial-position close), `--tradeQuoteCcy` (SPOT quote currency), `--banAmend` (disable OKX auto-amend), `--pxAmendType` (price out-of-range correction). CLI-only.
- **LLM eval probe coverage 17/17 MCP modules** (`eval/probes/`, !303). All modules now have trace-based probes (`findToolCall`); CI gate `eval-probe-check` enforces full coverage.

### Fixed

- **Log disk usage bounded with retention sweep** (`packages/core/src/logger.ts`, !312). Startup sweep prunes `~/.okx/logs/` files beyond the configured retention window — prevents unbounded disk growth on long-running installations.
- **`event_browse` concurrent fetch cap** (`packages/core/src/tools/event-trade.ts`, !300, #146). Semaphore caps concurrent market-fetches at 8 (OKX 20-req window minus 12 retry buffer). Switched to `Promise.allSettled` so a single failing series no longer aborts the browse.
- **`cmdAuthRemove` permission-denied error handling** (`packages/cli/src/commands/auth.ts`, !299, #159). Added integration test coverage for the EACCES path (`errorLine` in text mode, `{status:"failed",error:<msg>}` in JSON mode, `process.exitCode = 1`).
- **Layered Architecture diagram corrected** (`ARCHITECTURE.md`, `ARCHITECTURE.zh-CN.md`, !296, #185). Replaced the single-path waterfall (which mislabeled `packages/mcp/src/index.ts` as "CLI entry") with a two-binary diagram showing `okx-trade-mcp` and `okx` as independent binaries on top of `@agent-tradekit/core`.

### Changed

- **`smartmoney` schema: `sortBy` / `period` / `granularity` now required** (1.3.3-beta.2). All leaderboard + signal tools mark `sortBy` and `period` as `required`; `signal-trend-*` also requires `granularity`. Handlers inject defaults explicitly so MCP and CLI paths are deterministic. Compat: callers that already passed these params are unaffected.
- **`smartmoney` signal-* tools: clarify linear-only scope** (1.3.3-beta.2, SIG-01). `signal-*` tools and skill docs now state that `instCcyList` / `instCcy` aggregate USDT/USDS-margined contracts only — coin-margined positions are silently excluded by upstream. Docs only.
- **`linux-arm64` pilot binary routes to native arm64** (`packages/core/src/pilot/installer.ts`, !295). Removes the previous `linux-arm64 → linux-x64` qemu/binfmt emulation fallback.
- **Smart Money skill refreshed** (`skills/`, !294). Trigger phrases, workflow guidance, and tool surface descriptions updated for the new `smartmoney_*` tool set.
- **`context-kg/` mapping sections updated** (`context-kg/business/06-leaderboard-smartmoney-api.md`, `07-dcd-api.md`, `08-dca-api.md`, !302, #187). Rewrote "Mapping to…" sections to match the shipped tool surface; added "Backlog (not yet wrapped)" for V2-only upstream paths.

---

## [1.3.3-beta.3] - 2026-05-08

### Added

- **Windows named-pipe token retrieval for `okx auth`** (`packages/core/src/auth/`): On Windows hosts, OAuth bearer tokens are now fetched via a named pipe instead of fd3 forwarding, removing the requirement for WSL or elevated privileges. (!310)

- **`--tpLevel` multi-tier take-profit flag (Phase 3b)**: Pass `--tpLevel` multiple times on `okx {swap,spot,futures} place` and `algo place` to set independent TP tiers (e.g. `--tpLevel "px:78000,sz:0.5,kind:limit" --tpLevel "px:81000,sz:0.5,kind:market"`). Valid keys: `px`, `sz`, `kind`, `triggerPx`, `triggerPxType`, `amendPxOnTrigger`, `clOrdId`. Combining `--tpLevel` with legacy `--tpOrdPx`/`--tpTriggerPx` is rejected at the CLI layer. Not exposed in MCP tool descriptions or skill workflows (intentional). (!292, #183)

- **Phase 3a+c CLI power-user flags**: Six new optional flags — `--tpTriggerRatio`/`--slTriggerRatio` (ratio-based TP/SL triggers), `--closeFraction` (partial-position close, mutually exclusive with `--sz`), `--tradeQuoteCcy` (SPOT quote currency selection), `--banAmend` (disable OKX auto-amend on SPOT market orders), `--pxAmendType` (price out-of-range correction control). Applies to `okx {swap,spot,futures} place` and `okx {swap,futures} algo place`. No MCP or skill exposure (intentional). (!291, #182)

- **LLM eval probe coverage completed to 17/17 MCP modules** (`eval/probes/`): All remaining modules now have probe files at `eval/probes/<module>/tier2-<tool_name>.live.test.ts` using trace-based assertions (`findToolCall`). Full-suite 17/17 module coverage is now enforced by the CI `eval-probe-check` gate. (!303)

### Fixed

- **Log disk usage bounded with retention sweep** (`packages/core/src/logger.ts`): A startup sweep now prunes log files in `~/.okx/logs/` beyond the configured retention window, preventing unbounded disk growth on long-running installations. Previously, log files accumulated indefinitely. (!312)

- **`event_browse` concurrent fetch cap** (`packages/core/src/tools/event-trade.ts`, `event-helpers.ts`): Replaced unbounded `Promise.all` with a semaphore capped at 8 concurrent market-fetch requests (OKX window is 20 req; 12 reserved as buffer for retries). Switched to `Promise.allSettled` so a single failing series no longer aborts the entire browse — series with no active contracts are silently skipped. (!300, #146)

- **`cmdAuthRemove` permission-denied error handling** (`packages/cli/src/commands/auth.ts`): The existing error path when `removeAuthBinary()` throws (e.g. EACCES) now has integration test coverage: `errorLine` is emitted in text mode, `{status:"failed",error:<msg>}` in JSON mode, and `process.exitCode` is set to `1` in both cases with no rethrow. (!299, #159)

- **Layered Architecture diagram** (`ARCHITECTURE.md`, `ARCHITECTURE.zh-CN.md`): Replaced the single-path waterfall diagram — which incorrectly labeled `packages/mcp/src/index.ts` as "CLI entry" — with a two-binary diagram showing `okx-trade-mcp` and `okx` as independent binaries that both import from the shared `@agent-tradekit/core` SDK. (!296, #185)

### Changed

- **`linux-arm64` pilot binary now routes to native arm64** (`packages/core/src/pilot/installer.ts`): The previous `linux-arm64 → linux-x64` stop-gap fallback is removed. The platform now routes directly to the native arm64 binary published at `/upgradeapp/tools/pilot/linux-arm64/okx-pilot`, eliminating qemu/binfmt emulation overhead on ARM64 Linux hosts. (!295)

- **Smart money skill refreshed** (`skills/`): Updated trigger phrases, workflow guidance, and tool surface descriptions to reflect the current `smartmoney_*` tool set and signal semantics. (!294)

- **`context-kg/` mapping sections updated** (`context-kg/business/06-leaderboard-smartmoney-api.md`, `07-dcd-api.md`, `08-dca-api.md`): Rewrote the "Mapping to…" sections in all three docs to match the shipped tool surface: `06` now lists the 5 shipped `smartmoney_*` tools; `07` lists the 6 flat `dcd_*` tools with bundling-decision notes; `08` lists the 5 unified `dca_*` tools plus a new "Backlog (not yet wrapped)" subsection for the 10 V2-only upstream paths. (!302, #187)

---

## [1.3.3-beta.2] - 2026-05-08

### Docs — `smartmoney` signal tools: clarify linear-only scope (SIG-01)

`signal-*` tools and skill docs now state that `instCcyList` / `instCcy` aggregate **USDT/USDS-margined contracts only** — coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions are silently excluded by upstream. No behavior change.

### Changed — `smartmoney` schema: `sortBy` / `period` / `granularity` now required

- All leaderboard + signal tools mark `sortBy` and `period` as `required`; `signal-trend-*` also requires `granularity`. Fixes silent reliance on backend defaults (e.g. `period` documented as `90` but actually returning lifetime cumulative).
- `performance-by-trader`, `signal-overview-by-trader`, `signal-trend-by-trader` newly accept `sortBy` + `period` (T2 was period-only).
- Handlers inject defaults explicitly (`sortBy=pnl`; leaderboard `period=90` / signal `period=7`; trend `granularity=1h`) so MCP and CLI paths are deterministic.

Compat: callers that already passed these params or relied on documented defaults are unaffected.

## [1.3.3-beta.1] - 2026-05-06

### ⚠ BREAKING — `smartmoney` module redesign

Smart Money MCP/CLI surface is fully rewritten for AI-agent disambiguation. **No compat shim** — old tool/parameter/field names are removed. Full rationale in [`docs/designs/smartmoney.md`](docs/designs/smartmoney.md).

CLI parity: each CLI command is the MCP tool name minus `smartmoney_` and `get_`, snake → kebab (e.g. `smartmoney_get_traders_by_filter` ↔ `okx smartmoney traders-by-filter`). The `--authorIds` / `--instCcyList` flags accept comma-separated input (CLI splits to array at the boundary).

#### Tool surface (8 → 10 atomic tools)

| Old (1.3.2) | New | Notes |
|---|---|---|
| `get_traders` (pool-filter mode) | `get_traders_by_filter` | `limit` default 100 → 10 |
| `get_traders` (authorIds mode) | `get_performance_by_trader` | direct lookup, no pool filter |
| `get_trader_records` | `get_trader_orders_history` | aligns with `*_get_orders` family |
| `get_trader_positions` | `get_trader_positions` | name unchanged |
| `get_trader_position_history` | `get_trader_positions_history` | pluralized |
| `get_signal` (pool-filter mode) | `get_signal_overview_by_filter` | `ts` removed; `topInstruments` (default 20) subsumes "top-coin overview" |
| `get_signal` (authorIds mode) | `get_signal_overview_by_trader` | tighter input — pool filters removed (use `_by_filter` for tier discovery) |
| `get_signal_history` | `get_signal_trend_by_filter` | renamed for symmetry with `_by_trader` sibling |
| `get_overview`, `get_top_coin_signals`, `get_trader_detail` | _(removed)_ | superseded; `_trader_detail` was non-atomic |
| _(new)_ | `search_trader` | nickname → authorId resolution (≤10 matches, follower-count DESC) |
| _(new)_ | `get_signal_trend_by_trader` | single-asset time-series restricted to authorIds |

#### Input changes

- **Arrays replace CSV strings** for `authorIds` and `instCcyList` (typed arrays catch shape mistakes earlier than runtime CSV parsing).
- **Leaderboard pool-filter rename** to disambiguate from signal-side `*Tier` enums: `pnl` → `minPnl`, `winRate` → `minWinRate`, `asset` → `minAum` (`maxDrawdown` unchanged). Signal-side keeps `pnlTier` / `winRateTier` / `maxDrawdownTier` / `aumTier`.
- **Time anchors split by family**: leaderboard uses `updateTime` (12-digit `yyyyMMddHHmm` UTC+8); signal-trend uses optional `asOfTime` (10-digit `yyyyMMddHH` UTC, defaults to current hour); signal-overview takes no time input. `ts` and `dataVersion` removed as inputs everywhere.
- **`signal_*_by_trader` no longer takes pool filters** — pool-filter axis is exclusive to `_by_filter` siblings, see [`docs/designs/smartmoney.md`](docs/designs/smartmoney.md) §13.
- **Trader-side `instCcy` → `instId`** on `_trader_positions` / `_positions_history` / `_orders_history`: accepts full `instId` or bare base ccy; handler extracts base.
- **Signal pool-filter `period`** (3/7/30/90, default 7) now exposed on every signal-side tool (previously leaderboard only).
- **`lmtNum` max 500 → 2000** on signal-overview tools.

#### Output changes

- **Leaderboard fields renamed** (everywhere): `winRatio` → `winRate`, `maxRetreat` → `maxDrawdown`, `dataVersion` → `updateTime` (leaderboard-only; signal items keep `dataVersion` at bucket level).
- **Signal-overview reshaped to nested groups** per OpenAPI `/overview` spec — outer `ccy` plus `notional` / `longShortRatio` / `winRate` objects. Old flat fields (`vs1h` / `vs24h` / `vs7d`, top-level `longNotionalUsdt`, etc.) removed.
- **Added** `direction` (derived `"long" | "short"` from `posSide` + sign of `pos`) and `upl` (unrealized PnL, quote ccy) on `_trader_positions`.
- **Removed** `topNUsed`, `currentPrice`, `priceChange24h`, `fundingRate`, `openInterest`, `longShortAccountRatio`, `ts` from signal/overview output.

#### Other

- MCP tool annotations (`readOnlyHint` / `idempotentHint` / `openWorldHint`) on every tool.
- Actionable error messages replace opaque `sCode` strings.

#### Migration

```ts
// Multi-coin overview — instCcyList still works; no time input
smartmoney_get_signal_overview_by_filter({ instCcyList: ["BTC", "ETH"] })

// Single-coin signal-history → signal-trend; asOfTime is optional
smartmoney_get_signal_trend_by_filter({ instCcy: "BTC", granularity: "1h", limit: 24 })

// trader_detail composite removed → fan out 3 atomic calls in parallel
Promise.all([
  smartmoney_get_performance_by_trader({ authorIds: ["X"] }),
  smartmoney_get_trader_positions({ authorId: "X" }),
  smartmoney_get_trader_orders_history({ authorId: "X", limit: 50 }),
])
```

---

### Added

- **Windows support for OAuth token retrieval** (`packages/core/src/auth/binary.ts`). `execAuthToken()` now dispatches on `process.platform`: Unix keeps the existing fd-3 channel, while Windows creates a per-invocation named pipe `\\.\pipe\okx-auth-<256-bit-random>`, listens on it, and passes the name to the child via the `OKX_AUTH_TOKEN_PIPE` environment variable. The `okx-auth` Rust binary opens that pipe with `CreateFileW(FILE_GENERIC_WRITE, OPEN_EXISTING)`, writes the access token, and closes — signalling EOF to the parent. The pipe name is enforced to start with `\\.\pipe\okx-auth-` (the binary rejects arbitrary targets), and `OKX_AUTH_TOKEN_PIPE` is scrubbed by the child after read so it never leaks to grandchildren. Both platforms share the same exit-code → typed-error mapping (`finalizeToken` helper), so error messages are identical regardless of OS. Windows users can now complete the full `okx auth login` → token-backed REST flow end-to-end; previously the binary spawned successfully but the consumer's fd-3 read found nothing because Windows doesn't inherit POSIX file descriptors. The new code path is covered on POSIX hosts via UNIX-domain-socket substitution (`net.createServer` abstracts the transport), so CI does not require a Windows runner.

### Fixed

- **`event_browse` concurrency cap** (`packages/core/src/tools/event-trade.ts`, `event-helpers.ts`): replaced unbounded `Promise.all` with a semaphore-based `withConcurrency` helper capped at `MAX_CONCURRENT_MARKET_FETCHES = 8` concurrent market-fetch requests (rate limit window is 20 req; 12 requests kept as buffer for retries and other calls in the same window: `20 - 12 = 8`). Also switched from `Promise.all` to `Promise.allSettled` semantics so a single failing series fetch no longer aborts the entire browse — series with no active contracts are silently skipped and all successful series are still returned. Closes #146.

- **`cmdAuthRemove` error handling** (`packages/cli/src/commands/auth.ts`): the existing try/catch around `removeAuthBinary()` now has test coverage. Added two unit tests to `packages/cli/test/auth.test.ts` that verify when `removeAuthBinary()` throws (e.g. permission denied / EACCES): (a) `errorLine` is called with the error message in text mode, (b) JSON output `{status:"failed", error:<msg>}` is produced in json mode, and (c) `process.exitCode` is set to `1` in both cases with no rethrow to the caller. Closes #159.

- **Layered Architecture diagram** (`ARCHITECTURE.md`, `ARCHITECTURE.zh-CN.md`): replaced the single-path waterfall diagram that incorrectly labeled `packages/mcp/src/index.ts` as "CLI entry" with a two-binary diagram showing `okx-trade-mcp` and `okx` as independent binaries that both import from `@agent-tradekit/core` (shared SDK). Closes #185.
- **`docs/faq.md` — API key storage answer**: added a clarifying sentence that the CLI (`okx`) and the MCP server (`okx-trade-mcp`) each read `~/.okx/config.toml` independently with no dependency between them.

### Changed (other)

- **`linux-arm64` hosts now use native arm64 pilot binary** (`packages/core/src/pilot/installer.ts` `PLATFORM_MAP` + `scripts/postinstall-notice.js`). The previous `linux-arm64 → linux-x64` fallback (introduced as a stop-gap when no native binary was on CDN) downloaded the x64 binary and ran it via qemu/binfmt emulation. The native arm64 binary has been published at `/upgradeapp/tools/pilot/linux-arm64/okx-pilot` (verified 2026-04-29); routing to it directly removes the emulation overhead — faster startup, lower CPU.

- **`context-kg/` mapping sections refreshed for 06/07/08** (`context-kg/business/06-leaderboard-smartmoney-api.md`, `07-dcd-api.md`, `08-dca-api.md`): The "Mapping to …" sections in all three docs have been rewritten to reflect the as-shipped tool surface. `06` now lists the 5 shipped `smartmoney_*` tools (replacing the pre-implementation 7-tool `market_*` proposal) with a note that `feat/smartmoney-fix` is in flight for a further redesign. `07` now lists the 6 flat `dcd_*` tools with an explanation of the deliberate quote→trade and redeem-quote→redeem bundling decisions. `08` now lists the 5 unified `dca_*` tools that key off `algoOrdType: spot_dca | contract_dca`, plus a new "Backlog (not yet wrapped)" subsection listing the 10 V2-only upstream API paths not yet implemented. Closes #187.

---

## [1.3.2] - 2026-04-27

### Changed

- **`skills/okx-cex-auth/SKILL.md` — strict display templates + wait-for-signal flow**:
  - Login initiation: upgraded from "example reply format" to strict CN/EN templates with four mandatory fields (`site`, `verificationUri`, `userCode`, `expiresIn`). Template wording is now normative — agents must not abbreviate, reword, reorder, or translate.
  - Polling removed: agents no longer auto-poll `okx auth status --json` every 5–10 s. They now wait for the user to signal completion (e.g. "done", "好了"), then run `auth status --json` once to verify.
  - Login success display: restricted to `site` + `scopes` only. Explicit negative list forbids surfacing `expiresAt` / `ttl` (these are access-token TTL, not OAuth session lifetime — tokens auto-refresh transparently) and `profile` (internal routing field). If asked about session longevity, agents must use the fixed phrase "Session stays active as long as you use the CLI periodically." and never quote a number.
  - Cross-section consistency: Step 0.3 table and Login Status Check table updated to reference the new strict templates and wait-for-signal semantics.

### Added

- **`eval/probes/` infrastructure + CI gate `eval-probe-check`** (MR !303). Every new/modified MCP tool now requires a probe at `eval/probes/<module>/tier2-<tool_name>.live.test.ts`; the CI job is `allow_failure: false` and runs on every merge_request_event. Probes use trace-based assertions (`findToolCall(trace, { commandPatterns })`) on the agent's `tool_use` blocks parsed from `anthropic-payload.jsonl` — they verify the LLM picked the right `okx <module> <subcommand>` with the right parameters, regardless of upstream API auth result. **Module coverage to date**: 12/17 modules (28 contributor probes covering market, spot, swap, futures, option, account, event, news, smartmoney, skills, bot.{grid,dca}, earn.{savings,onchain,dcd,flash}). Deferred: `earn.autoearn` (placeholder dir only), `earn.fixed` (no dir yet). See [`eval/README.md`](eval/README.md) for the probe skeleton + CLI command pattern recipe table.
- **Phase 3b CLI power-user flag — `--tpLevel` (multi-value, repeatable)** (issue #183, CLI power-user flag — no MCP / skill exposure). Enables true multi-tier take-profit on a single order, replacing the manual workaround of placing a second algo order after entry. Pass `--tpLevel` multiple times, each with a comma-separated `key:value` mini-DSL string (e.g. `--tpLevel "px:78000,sz:0.5,kind:limit" --tpLevel "px:81000,sz:0.5,kind:limit"`). Valid keys: `px` (tpOrdPx), `sz`, `kind` (tpOrdKind), `triggerPx` (tpTriggerPx), `triggerPxType`, `amendPxOnTrigger`, `clOrdId`. Applies to `okx {swap,spot,futures} place` and `okx {swap,spot,futures} algo place`. Conflict detection: passing both `--tpLevel` and `--tpTriggerPx`/`--tpOrdPx` raises a CLI-layer error. Backward compat: not passing `--tpLevel` produces identical wire payload to Phase 3a+c. MCP tool `inputSchema.properties` is unchanged — this flag is not discoverable via MCP tool descriptions or skill workflows, intentionally limiting autonomous agent use.
- **Phase 3a+c CLI power-user flags — `--tpTriggerRatio`, `--slTriggerRatio`, `--closeFraction`, `--tradeQuoteCcy`, `--banAmend`, `--pxAmendType`** (issue #182, CLI power-user flags — no MCP / skill exposure). Six new optional CLI flags for advanced quant users. `--tpTriggerRatio`/`--slTriggerRatio`: ratio-based TP/SL triggers (percentage from entry price) for algo place orders across swap/spot/futures. `--closeFraction`: partial-position close fraction for conditional/oco algo orders (mutually exclusive with `--sz`; OKX server enforces, returns 51000 on conflict — no CLI-side validation). `--tradeQuoteCcy`: select quote currency for SPOT place orders (e.g. USDT|USDC|BTC). `--banAmend`: disable OKX auto-amend on SPOT market orders. `--pxAmendType`: disable OKX auto-correction on out-of-range prices ("0"=allow auto-correct, "1"=reject). All flags are optional with no defaults; not passing them produces identical wire payload as Phase 2. MCP tool `inputSchema.properties` is unchanged — these flags are not discoverable via MCP tool descriptions or skill workflows, intentionally limiting autonomous agent use.
- **Phase 2 algo ordTypes — `trigger`, `chase`, `iceberg`, `twap`** (issue #181). Four new `ordType` values on `okx {swap,spot,futures} algo place`, closing the remaining OKX OpenAPI v5 enum gap. `trigger`: submit a pending order that activates when the market reaches `--triggerPx` (provide `--triggerPx` + `--orderPx`). `chase`: smart-follow best bid/ask within configurable distance/ratio bounds (`--chaseType`, `--chaseVal`, `--maxChaseType`, `--maxChaseVal`). `iceberg`: split a large order into child orders at fixed intervals (`--szLimit`, `--pxLimit`, `--timeInterval`, `--pxVar`/`--pxSpread`). `twap`: time-weighted average price split using the same parameter set as `iceberg`. Backward compat: existing `conditional`/`oco`/`move_order_stop` invocations produce identical wire payloads. Token budget delta: ~+600 tokens across 3 tools (4 new ordTypes × ~5 new fields each).
- **Phase 1 algo order flags — `--tpOrdKind`, `--tpTriggerPxType`, `--slTriggerPxType`, `--stpMode`, `--cxlOnClosePos`** (issue #178). Five new optional flags for trade order placement, closing the highest-ROI subset of the CLI/MCP↔OKX OpenAPI drift. `--tpOrdKind limit` places an immediate limit TP order (no trigger phase). `--tpTriggerPxType`/`--slTriggerPxType` control the TP/SL trigger price source (`last`/`index`/`mark`). `--stpMode` enables self-trade prevention (`cancel_maker`/`cancel_taker`/`cancel_both`). `--cxlOnClosePos` auto-cancels algo orders when the associated position closes. All flags are optional; not passing them yields identical wire payload as before. Applies to: `okx {swap,spot,futures,option} place`, `okx {swap,futures} algo place`, `okx spot algo place`.

### Fixed

- **`suggestSubcommand` no longer hallucinate non-existent subcommand paths** (issue #179). Previously, the `x-y → y x` heuristic in `packages/cli/src/unknown-command.ts` would suggest `"<b> <a>"` whenever `b` appeared in the module's `knownActions` list, without verifying that the combined path actually exists. For example, `okx swap set-leverage` suggested `okx swap leverage set`, which is not a registered subcommand. Fix: `suggestSubcommand` now accepts a `knownPaths: readonly string[]` parameter and only returns the suggestion when the combined path is explicitly listed. The legitimate `place-algo → algo place` positive case (#173) is preserved — callers pass `["algo place", "algo cancel", ...]` as `knownPaths`. Modules without multi-token subcommand paths default to `[]`, suppressing spurious suggestions entirely.
- **Codex CLI blocked from loading `okx-cex-trade` skill** — description field exceeded the 1024-char Codex limit (was 1448 chars). Trimmed by deduping synonymous trigger phrases; all concrete trade-type triggers preserved. Pre-emptively trimmed `okx-sentiment-tracker` (944 → 652 chars) and `okx-cex-market` (887 → 706 chars) for headroom. Added CI test `packages/cli/test/skill-description-length.test.ts` to enforce the 1024-char ceiling going forward.

## [1.3.2-beta.4] - 2026-04-24

### Added

- **OAuth Bearer token authentication (`okx auth`)**: New authentication method via the `okx-auth` Rust binary. Supports OAuth 2.1 device flow — `okx auth login` initiates browser-based login, `okx auth status` shows session state, `okx auth logout` revokes tokens. The binary handles token storage, refresh (300 s TTL lead), and scrypt + AES-256-GCM encryption. Tokens are read via fd3 pipe at request time with a 60 s JS-side cache. Auth mode is selected dynamically per request: API key HMAC (if configured) takes priority; OAuth Bearer token is used as fallback.
- **`okx auth install/install-status/remove` CLI commands**: Manage the `okx-auth` binary installation. CDN download with checksum verification, atomic replacement, and multi-source fallback — mirrors the DoH installer pattern.
- **`skills/okx-cex-auth/SKILL.md`**: New skill documentation for OAuth authentication workflows.
- **`postinstall` auto-download for okx-auth binary**: Best-effort download alongside the existing DoH binary during `npm install`.
- **`context-kg/` knowledge base**: Added `technical/06-oauth-authentication.md` covering OAuth subsystem architecture, binary distribution, fd3 token retrieval, auth priority, and CLI commands.

### Changed

- **`loadConfig()` is now async** (returns `Promise<OkxConfig>`): Startup now calls `execAuthStatus()` to detect OAuth login state.
- **`OkxConfig` requires `profile` field**: Resolved profile name is now included for OAuth token storage path resolution.
- **`OkxRestClient.buildHeaders()` is now async**: Supports dynamic auth method selection (API key HMAC or OAuth Bearer token) at request time.
- **`PLATFORM_MAP["linux-arm64"]` now maps to `linux-x64`** (`packages/core/src/pilot/installer.ts`). This matches the standard Docker Desktop test environment on Apple Silicon, where containers run under `linux/amd64` emulation. Native `linux-arm64` hosts will therefore install the `linux-x64` binary and rely on the host's binfmt / emulation layer. This is a deliberate alias, not a regression of the issue #166 fix — the entry is still present, just pointing at the x64 directory. A native `linux-arm64` CDN directory is tracked as future work.

### Fixed

- **`okx auth login` now refuses to start OAuth when API-key credentials are already configured.** Previously, `cmdAuthLogin` always spawned the `okx-auth` binary regardless of `~/.okx/config.toml` state. An agent following older guidance could start an OAuth device flow on a machine whose API-key profile was already good, producing a confusing login prompt and a URL/code the user did not need. `cmdAuthLogin` now calls `readFullConfig()` first: if any profile has a non-empty `api_key`, it prints `"API key already configured (profile: <name>). OAuth login skipped — API key will be used automatically."` and returns exit 0 without spawning the binary. In `--manual` mode the same outcome is encoded as JSON `{"status":"skipped","reason":"api_key_configured","profile":"<name>","message":"..."}` so agents can detect it programmatically. This belt-and-suspenders with the REST client's existing API-key preference (`rest-client.ts applyAuth` — API key is checked first and never falls back to OAuth).

- **`skills/okx-cex-auth/SKILL.md` pre-flight decision tree rewritten** to match the three-step flow: (1) check whether any `site` has been selected (union of `config show --json` profiles and `auth status --json`), and if not, present the site menu in chat verbatim before any login attempt; (2) check `api_key` — stop if present; (3) only then proceed to OAuth with the chosen `--site`. Previously the tree offered "First-Time Setup **or** Login Flow" as interchangeable paths for the "no credential" case, which let the model skip site selection and fall back to the OAuth binary's default (`global`). Also corrected the false claim that `okx config init` "handles site selection and OAuth login in one flow" — `cmdConfigInit` is an API-key wizard (site + demo/live + AK/SK/PP) and never performs OAuth. A new **Step 0.2.a** section was added for the invalid-API-key case: when an API-key profile exists but the API call returns `401 Unauthorized` / `Invalid Sign`, OAuth login is **not** a valid remediation (the REST client still prefers the broken API key; any OAuth token obtained afterwards would go unused). The agent must present exactly two neutral options — replace the API key, or remove the broken profile before starting OAuth — and let the user choose. This prevents the Haiku 4.5 failure mode observed in openclaw where the agent silently labelled OAuth as "recommended" even though OAuth could not have worked without first clearing the broken profile.

- **`skills/_shared/preflight.md` and `skills/okx-cex-portfolio/SKILL.md` auth-method detection corrected.** Both files previously used the `apiKey` field from `okx auth status --json` to branch between API-key and OAuth mode. That field reports the `okx-auth` binary's internal state and is **always** `false` regardless of whether `~/.okx/config.toml` contains an API-key profile; it cannot detect API-key users. Consequence: an agent following the old preflight would see `apiKey: false, status: not_logged_in`, conclude "no auth", and route the user into the OAuth login skill — even when a valid API-key profile already existed. Both files now require running **both** `okx config show --json` (authoritative for API-key presence) and `okx auth status --json` (authoritative for OAuth session state), with a decision table that checks API-key first and never relies on the unreliable `apiKey` status field.

- **`skills/okx-cex-trade/SKILL.md`, `skills/okx-cex-bot/SKILL.md`, `skills/okx-cex-earn/SKILL.md` Step A auth detection corrected.** Same class of bug as the preflight/portfolio fix above: the three skills' credential checks branched on `auth status --json` → `apiKey` (always `false`), so API-key users were misrouted into the OAuth login skill. Step A now runs both `okx config show --json` and `okx auth status --json`, checks API-key presence first, and only falls through to OAuth when no API-key profile is configured.

## [1.3.2-beta.3] - 2026-04-23

### Fixed

- **`event_get_orders` / `event_get_fills` returning empty arrays** — root cause: for EVENTS instType, `/api/v5/trade/fills` (3-day window) often returns empty while `/api/v5/trade/fills-history` (3-month) contains the data. The wrapper lacked `archive` mode and other query parameters. Added `archive` mode for fills, `status` (open/history/archive) routing for orders, time-range filters (`begin`/`end`), cursor pagination (`after`/`before`), and `ordId` filter. Also confirmed that `instFamily` is NOT supported for EVENTS on trade endpoints (causes HTTP 400). Response now includes `requestParams` for debugging.

### Changed

- **`smartmoney` description cleanup.** MCP / CLI / skill now consistently use "instId takes precedence if both set". Pool-filter descriptions keep enums / defaults / key semantics (`PNL_TOP20` = top 20 %, `period` = win-rate window only) but drop verbose prose; tool descriptions now state ts-or-dataVersion requirement up front. Docs only, no runtime change.

## [1.3.2-beta.2] - 2026-04-23

### Changed

- **`smartmoney signal` / `smartmoney_get_signal`: document `--instId` as recommended; `--instCcy` may return empty.** The `/api/v5/journal/smartmoney/signal` endpoint accepts `instCcy` per spec but in practice may return `data: []` even when the same `instCcy` works on `/overview`. Tool description, CLI reference, and API doc now steer callers to `--instId` (e.g. `BTC-USDT-SWAP`) for reliable single-currency signals. No code change — `instCcy` is still passed through.

- **`okx doh` command replaced by `okx pilot`** (issue #169). The `doh` CLI module is removed and replaced by `pilot` (`okx pilot status/install/remove`). Running `okx doh` will now report an unknown command.

- **CDN path unified: both `installer.ts` and `postinstall-notice.js` now use `/upgradeapp/tools/pilot`** (issue #169). Previously the two files were out of sync — `installer.ts` used `/upgradeapp/doh` while `postinstall-notice.js` was already at `/upgradeapp/tools/doh`. Both now converge on `/upgradeapp/tools/pilot`. The old paths are no longer valid.

#### BREAKING CHANGES

- **`OKX_DOH_BINARY_PATH` environment variable renamed to `OKX_PILOT_BINARY_PATH`**. No backward-compatible shim is provided. Update any scripts or shell profiles that set this variable.

- **`OKX_DOH_CACHE_PATH` environment variable renamed to `OKX_PILOT_CACHE_PATH`**. No backward-compatible shim is provided. Update any scripts or shell profiles that set this variable.

- **Cache file `~/.okx/doh-cache.json` replaced by `~/.okx/pilot-cache.json`**. The old file is now obsolete and can be safely deleted (`rm ~/.okx/doh-cache.json`). The new cache will be populated automatically on the next request.

- **`okx doh` command removed, replaced by `okx pilot`**. All three subcommands are available as `okx pilot status`, `okx pilot install`, `okx pilot remove`.

### Fixed

- **`okx market oi-history` table rendering fixed — no longer prints "No OI data" when data exists**. The API returns `data` as an array `[{ instId, bar, rows: [...] }]`, but the CLI was accessing `data["rows"]` directly on the array, which yielded `undefined` and always fell into the empty-data branch. The handler now unwraps `data[0]` before reading `rows`/`instId`/`bar`. `--json` mode was unaffected and keeps its current output. Unit tests updated to mirror the real array-wrapped API shape so this class of bug cannot recur silently.

- **`linux-arm64` platform now included in Pilot binary installer** (issue #166). `getPlatformDir()` was missing an entry for `"linux-arm64"`, causing install/update to fall back to `undefined` and write the binary to the wrong path on ARM64 Linux hosts. The entry `"linux-arm64": "linux-arm64"` is now present.

- **Pilot proxy re-resolution is now `await`-ed before continuing on network failure** (issue #166). Two call sites in `rest-client.ts` invoked `handleNetworkFailure()` as fire-and-forget (`handleNetworkFailure().catch(() => {})`), meaning the cache write and proxy state update could race with the retry request. Both sites now use `try { await this.pilot.handleNetworkFailure(); } catch {}`, ensuring the proxy node is fully resolved and the cache is persisted before the retry is issued.

- **`market` dispatcher: `orderbook`, `candles`, `trades`, `funding-rate` no longer emit spurious `Unknown market command` error and exit 1** (issue #175, regression introduced by commit `9fd4717` on 2026-04-14). The `handleMarketFilterCommand` refactor in that commit left an `errorLine + exitCode=1` block at its tail. Because `handleMarketPublicCommand` unconditionally tail-calls `handleMarketFilterCommand` as its fallback, the error fired before `handleMarketDataCommand` had a chance to dispatch the action — all four subcommands produced correct JSON on stdout but also wrote an error to stderr and exited 1, causing `set -e` scripts to hard-fail even though the underlying API call succeeded. Fix: removed the side-effect block from `handleMarketFilterCommand` (it now returns `undefined` silently on no match, consistent with every other sub-handler), and added `unknownSubcommand("market", action, [...])` in `handleMarketCommand` after both sub-dispatchers return `undefined` — the same pattern used by `swap`, `spot`, `futures`, `option`, `account`, and `bot` post-#173. Truly unknown market actions (e.g. `okx market foo`) continue to error with the structured diagnostic from `unknownSubcommand()` and exit 1.

- **`account_get_asset_balance` total asset valuation now defaults to USDT denomination** (issue #174). Previously, `showValuation=true` called `/api/v5/asset/asset-valuation` with no `ccy` parameter, causing OKX to default to BTC — a user with $3,834 in assets would see `0.049` instead of `3834`. A new `valuationCcy` parameter (default `"USDT"`) is now passed to the valuation endpoint. Callers can override to any OKX-supported currency (e.g. `valuationCcy="BTC"`). The chosen denomination is stamped as `valuationCcy` in the returned JSON. CLI: `okx account asset-balance --valuation` now shows USDT-denominated totals by default; use `--valuationCcy BTC` for BTC-denominated totals.

- **CLI no longer silently exits 0 on unknown subcommands** (issue #173). Previously, every second-level module dispatcher (`swap`, `spot`, `futures`, `option`, `account`, `bot`) fell through to `return undefined` when the action name didn't match any registered branch, producing an invisible failure — `okx swap place-algo` would exit 0 with no output, misleading scripts with `&& echo OK` and masking the real problem. Each dispatcher now calls the shared `unknownSubcommand()` helper which emits `Unknown command: okx <mod> <action>` to stderr, lists the available subcommands, suggests an MCP-name-to-CLI rewrite when applicable (`place-algo` → `algo place`), and sets a non-zero exit code. Reported via CS Telegram 2026-04-21 — customer's `okx --profile demo swap place-algo ...` returned silently, leaving them unable to tell whether the feature was broken or the command wrong.

- **`skills/okx-cex-trade/` reference docs now call out the CLI↔MCP naming mismatch.** `SKILL.md` has a top-level note; `references/swap-commands.md` has a dedicated "Naming — CLI vs MCP tool" table mapping each tool identifier to its CLI subcommand path. Motivated by the same #173 report: customers see `swap_place_algo_order` in MCP tool listings and guess the CLI form is `swap place-algo`, which silently failed pre-fix and now errors explicitly.

## [1.3.2-beta.1] - 2026-04-21

### Added

- **`spot_set_leverage` MCP tool and `okx spot leverage` CLI command**: Set the leverage ratio for a spot margin or cross-margin instrument. Accepts `--instId` (instrument-level) or `--ccy` (currency-level) alongside `--lever` and `--mgnMode`. Input is validated before the HTTP call — non-numeric, zero, or negative `lever` values are rejected immediately with an actionable error. Supports all 5 OKX leverage scenarios for SPOT/MARGIN.

- **Smart Money module** (`smartmoney`): 5 new read-only MCP tools (`smartmoney_get_overview`, `smartmoney_get_signal`, `smartmoney_get_signal_history`, `smartmoney_get_traders`, `smartmoney_get_trader_detail`) and corresponding CLI commands for accessing trader leaderboard, position analysis, and smart money signals.

- **`context-kg/` upstream API specs**: Three new business-domain reference docs under `context-kg/business/` capturing upstream OKX API contracts consumed by the repo — `06-leaderboard-smartmoney-api.md` (7 leaderboard / smart-money endpoints backing issue #94, with live-probe status and field-drift notes), `07-dcd-api.md` (8 DCD structured-product endpoints with state machine and error codes), `08-dca-api.md` (19 Spot/Contract DCA bot endpoints with sync-copy restrictions). Intended as the source of truth for cross-checking tool design, request/response shapes, and enum values during implementation.
- **`grid_amend_order` MCP tool and `okx bot grid amend` CLI command** — Amend a running grid bot without stopping it. Supports three modes combinable in a single call: price-range mode (`maxPx`+`minPx`+`gridNum`) to adjust the upper/lower boundary and grid count; TP/SL mode (`instId` + any of `tpTriggerPx`/`slTriggerPx`/`tpRatio`/`slRatio`) to set or clear take-profit/stop-loss; and combined mode for both at once. Pass `"-1"` to explicitly clear an existing TP or SL. CLI: `okx bot grid amend --algoId <id> [--maxPx ..] [--minPx ..] [--gridNum ..] [--instId ..] [--tpTriggerPx ..] [--slTriggerPx ..]`.

#### Breaking Changes

- **`grid_stop_order` MCP tool: `stopType` values `"3"`, `"5"`, and `"6"` explicitly removed** (ALGO-37613) — These values are no longer valid for grid bot stop operations and must not be used. The valid set is now `["1","2"]` only: `"1"` closes all positions immediately (default clean exit), `"2"` stops the strategy without selling. Callers passing `"3"`, `"5"`, or `"6"` will fail schema validation. **Migration**: replace any usage of `"3"/"5"/"6"` with `"1"` (immediate close) or `"2"` (keep positions) based on the desired exit behaviour.

### Fixed

- **`swap_set_leverage` / `futures_set_leverage` input validation**: Invalid `lever` values (non-numeric, zero, negative) are now rejected before the HTTP call with a clear error message instead of surfacing an opaque OKX 51xxx error. `mgnMode` and `posSide` are validated against allowed enums. The `cross` + `long`/`short` combination is explicitly blocked with the hint "posSide only valid with isolated margin mode", matching OKX's business rule and reducing the ~9.7% failure rate from callers sending invalid combinations. Tool descriptions are rewritten to enumerate the three applicable SWAP/FUTURES scenarios (cross index-level / isolated one-way / isolated hedge) and explicitly flag portfolio-margin cross as unsupported.

### Changed

- Smart Money signal API paths changed: `/api/v5/journal/public/smartmoney/*` → `/api/v5/journal/smartmoney/*` to align with upstream OKX endpoint (4.1 signal, 4.2 signal-history, 4.3 overview).
- Removed demo-mode guard from Smart Money module — all 5 tools now work in both live and simulated trading mode. Previously they threw `ConfigError` in demo mode.

- **News CLI `--importance` default switched to `low`** for `okx news latest`, `okx news by-coin`, and `okx news search`. Previously these commands forwarded `undefined` to the server, which applies its `high`-only default and silently narrowed results. They now default to `low` (returns all news, both high and low importance) for broader browsing. Pass `--importance high` explicitly — or use the dedicated `okx news important` command — when you only want breaking / major news. MCP `news_get_latest` / `news_get_by_coin` / `news_search` tool descriptions updated to reflect the same semantics so AI agents pick `low` for broad queries and `high` only when the user explicitly asks for major news.

- **News skill: time-window handling for `--platform` queries**. The API's default `--begin` window is 72 hours, too narrow for bursty news sources and a frequent cause of empty results. `okx-sentiment-tracker` Source-Filtered News and Empty Results fallback sections now instruct agents to broaden `--begin` to 7 then 30 days before concluding a source has no data. The Known Limitations "Source Coverage" table that hardcoded per-platform activity labels was removed — those labels were based on the narrow 72-hour assumption and could mislead agents into giving up prematurely. Replaced with a generic rule that platform cadence is uneven and candidates should be resolved from `okx news platforms` rather than assumed.

---

## [1.3.1] - 2026-04-17

### Added

- **`news` module (restored)**: Orbit News API integration is back following compliance approval. Seven tools cover latest news, coin-specific news, search, article detail, platform listing, coin sentiment, and sentiment rankings. CLI: `okx news latest / by-coin / search / detail / platforms / sentiment / sentiment-ranking`. Supports `--platform` to filter by source (e.g. `blockbeats`, `odaily_flash`). `Accept-Language` uses standard IETF BCP 47 format. All news tools return a clear `ConfigError` in demo/simulated trading mode. (!251, !249, !235)

- **Event contract module** (`event`): New binary prediction-markets module with 9 MCP tools and matching CLI commands — browse open events, query contract details, place and manage event-contract orders. (!216)

- **Flash Earn module** (`earn.flash`): New instant-earn tools for flash-earn deposit and redemption operations. (!246)

- **Three new market tools** — `market_filter` (screen instruments by multi-dimensional criteria), `market_get_oi_history` (open interest history), and `market_get_oi_change_filter` (filter by OI change magnitude). CLI: `okx market filter / oi-history / oi-change-filter`. (!245)

- **Auto-generated CLI help from ToolSpec registry and `okx list-tools`**: CLI help is now derived from a declarative `CLI_REGISTRY` sourced from ToolSpec objects in `@agent-tradekit/core`, keeping help text in sync with the MCP tool registry. A new `okx list-tools [--json]` command serializes the full registry into structured JSON for AI agent self-discovery. (!234)

- **`okx doh` binary management commands**: `okx doh status` reports binary path, size, SHA-256, and CDN match; `okx doh install` downloads or updates the binary; `okx doh remove` deletes it (with confirmation or `--force`). DoH resolver status is also surfaced in `okx --version` and `okx diagnose`. (!232)

- **DoH (DNS-over-HTTPS) proxy for API requests**: When the OKX API domain is unreachable (e.g. DNS poisoning), the SDK transparently resolves an alternative proxy node via a local `okx-doh-resolver` binary, with cache-first strategy and automatic failed-node exclusion. `postinstall` downloads the platform binary to `~/.okx/bin/`; supports darwin-arm64, darwin-x64, linux-x64, linux-arm64, and win32-x64. (!230, !237)

- **`context-kg/` agent knowledge base with accuracy drift test**: Structured knowledge files for AI agents covering trading, market/account, earn/bot, errors, multi-site architecture, DoH proxy, `tgtCcy=margin` usage, and test quality rules. Automated drift test validates declared counts match actual code state at CI time. (#137, #160, !231, !238, !248)

### Fixed

- **Error code remediation hints now match OKX official API error reference**: Custom suggestions replaced by verbatim text from OKX's official API error documentation. (#163, !250)

- **CLI `list-tools` routing fix**: `okx list-tools` no longer falls through to "Unknown command" in the main router. (#161, !247)

- **CLI help text: missing parameters audited and restored**: All parameters identified as missing from CLI help output have been added back. (#155, !244)

- **`market_list_indicators`: improved descriptions and name validation**: Indicator names are now validated; unknown names return a clear error instead of silently returning empty results. (#153, !243)

- **`market_get_funding_rate` validates SWAP `instId`**: Non-SWAP instrument IDs are now rejected with a clear error before reaching the OKX API. (#152, !242)

- **Market filter docs: SPOT queries require explicit `quoteCcy=USDT`**: Clarified in tool and CLI descriptions that SPOT market queries must include `quoteCcy=USDT` to avoid empty results. (!257)

- **Skills language-neutral instructions**: Removed hardcoded Chinese-language prompts from `SKILL.md` so agent behavior is consistent regardless of session locale. (!233)

- **Skills: leverage error troubleshooting guidance**: Added specific remediation steps for leverage-related errors plus a general safeguard requiring read-only diagnosis before any write-operation fix. (!229)

- **CLI miscellaneous fixes**: Addressed cosmetic and behavioral issues flagged in code review. (#141, #142, #143, !236)

### Changed

- **Skills download: two-step presigned URL flow**: `skills_download` (MCP) and `okx skill download` (CLI) now obtain a short-lived presigned URL before fetching the skill archive, improving download security and reliability. (!240)

- **DoH resolver updated to v9**: Binary updated with revised protocol and CDN endpoint list. (!255)

- **Skills docs: TP/SL amend workflow clarified**: Skill documentation now guides users to `algo_amend_order` for modifying TP/SL on existing algo orders, improving discoverability. (!241)

- **CLI `okx news domains` renamed to `okx news platforms`**: Aligns CLI subcommand with the `--platform` parameter terminology.

- **Skill renamed `okx-cex-news` → `okx-sentiment-tracker`**: Skill directory and frontmatter name updated. MCP tool names (`news_*`) and CLI commands (`okx news`) are unchanged.

### Removed

- **`importance=medium` enum value**: Removed from `NEWS_IMPORTANCE` validation. The OKX API does not support `medium`; passing it returned a parameter error (51000). Only `high` and `low` are valid.

---

## [1.3.1-beta.7] - 2026-04-15

### Fixed

- **`okx list-tools` routing falls through to "Unknown command"**: Fixed command routing so `list-tools` is correctly dispatched without falling through to the default unknown-command handler. (#161)

---

## [1.3.1-beta.6] - 2026-04-14

### Added

- **Event Contract module**: New `event` module with 9 MCP tools and CLI commands for binary prediction markets — browse series/events/markets, place/amend/cancel orders, query orders/fills, and direction analysis with index price enrichment.
- **DoH (DNS-over-HTTPS) proxy for REST API requests**: Transparently resolves an alternative proxy node through a local `okx-pilot` binary when OKX API is unreachable via direct connection. Cache-first, zero overhead on cached paths. Supports `--verbose` logging.
- **Automatic DoH binary download on install**: `postinstall` downloads the platform-specific `okx-pilot` binary from CDN to `~/.okx/bin/`. Best-effort, never blocks `npm install`. Supports darwin-arm64, darwin-x64, linux-x64, linux-arm64, and win32-x64.
- **`okx doh` management commands**: `okx doh status`, `okx doh install`, `okx doh remove` for managing the DoH resolver binary. (#138)
- **DoH status in `okx --version` and `okx diagnose`**: Version output shows DoH resolver install status; `diagnose` checks binary existence and CDN checksum. (#138)
- **Auto-generated CLI help from ToolSpec registry**: CLI help text generated from declarative `CLI_REGISTRY` map, sourced from ToolSpec objects in `@agent-tradekit/core`. Bidirectional drift test catches mismatches at test time. (#140)
- **`okx list-tools [--json]` agent self-discovery command**: Serializes the full CLI registry into structured JSON for programmatic enumeration of all capabilities, parameters, and tool names. (#140)
- **TP/SL amend discoverability**: `{module}_amend_order` descriptions route users to `{module}_amend_algo_order` for modifying attached TP/SL. Skills `workflows.md` adds a "Modify existing TP/SL" scenario. (#151)
- **Market filter tools** (`market`): Three new MCP tools and CLI commands — `market_filter` / `okx market filter` (screen SPOT/SWAP/FUTURES by price, 24h change, market cap, volume, funding rate, OI with sort/limit support), `market_get_oi_history` / `okx market oi-history` (OI time-series with bar-over-bar delta), `market_filter_oi_change` / `okx market oi-change` (rank by OI change magnitude with filters).
- **`news` module restored**: 7 MCP tools and CLI commands for crypto news querying — `news_get_latest`, `news_get_by_coin`, `news_search`, `news_get_detail`, `news_get_domains`, `news_get_coin_sentiment`. Fixed `Accept-Language` header default.
- **Flash Earn module** (`earn.flash`): New `earn_get_flash_earn_projects` MCP tool and `okx earn flash-earn projects` CLI command for browsing upcoming and in-progress Flash Earn opportunities.
- **`context-kg/` knowledge base expanded**: Added DoH subsystem doc, `tgtCcy=margin` documentation, architecture updates, and full testing & QA specification. (#150)
- **Skills download two-step presign flow**: `skills_download` / `okx skill download` now uses a presigned URL flow for more reliable binary downloads.

### Changed

- **`market_get_indicator` improved descriptions and pre-call name validation**: Descriptions now list common indicator names and link to `market_list_indicators`. Unknown names return a `ValidationError` with similar-name suggestions before any API call. (#153)
- **`market_filter` `marketCapUsd` is SPOT-only**: Description clarified that `marketCapUsd` filter only applies to `instType=SPOT` per upstream API constraint.

### Fixed

- **Event Contract endpoints use authenticated requests**: All 4 event browse/query tools use `privateGet` — OKX's `/public/event-contract/*` endpoints require auth headers.
- **Skill docs: error-suggested remediation safeguard**: Agent must diagnose with read-only queries before acting on write-operation suggestions. MCP server returns `instructions` safeguard field. (#leverage)
- **CLI help missing params audit**: Added missing parameters in `spot`, `swap`, `futures` CLI help entries. (#155)
- **Skills: remove hardcoded Chinese prompts**: Replaced hardcoded Chinese disambiguation prompts in `SKILL.md` with language-adaptive English instructions.

---

## [1.3.1-beta.4] - 2026-04-10

### Added

- **DoH (DNS-over-HTTPS) proxy for REST API requests**: When the OKX API domain is unreachable via direct connection (e.g. DNS poisoning), the SDK now transparently resolves an alternative proxy node through a local `okx-pilot` binary. Cache-first strategy: first request attempts direct connection; on network failure the binary is invoked and the result is cached. Subsequent requests reuse the cached node with zero overhead. Failed proxy nodes are automatically excluded and re-resolved. Supports `--verbose` logging for full DoH lifecycle visibility.
- **Automatic DoH binary download on install**: `postinstall` now downloads the platform-specific `okx-pilot` binary from CDN (with multi-source fallback) to `~/.okx/bin/`. Best-effort — never blocks `npm install`. Supports darwin-arm64, darwin-x64, linux-x64, and win32-x64.
- **`context-kg/` knowledge base**: Bootstrap structured knowledge files for AI agents — 5 business domain docs (overview, trading, market/account, earn/bot, skills) + 4 technical docs (architecture, configuration, errors, multi-site) + quality placeholder. Includes `config.toml.example` `knowledge_dir` config entry. (#137)

### Fixed

- **Skill docs: error-suggested remediation safeguard** — Added a general safeguard rule: when an OKX API error suggests a fix involving write operations (cancel orders, close positions, stop bots), the agent must diagnose with read-only queries first and wait for user confirmation before acting. Also added specific leverage error troubleshooting guidance. Affected files: `swap-commands.md`, `futures-commands.md`, `workflows.md`, `SKILL.md`.
- **MCP server: remediation safeguard** — MCP server now returns `instructions` field with safeguard rule; error responses whose message suggests write-operation remediation (cancel/close/stop) are automatically annotated with a warning to diagnose first and confirm with the user.

---

## [1.3.1-beta.2] - 2026-04-09

### Added

- **Event Contract module**: New `event` module with 9 MCP tools and CLI commands for binary prediction markets — browse series/events/markets, place/amend/cancel orders, query orders/fills, and direction analysis with index price enrichment.

### Fixed

- **Event Contract endpoints use authenticated requests**: All 4 event browse/query tools (`event_browse_contracts`, `event_get_series`, `event_get_events`, `event_get_markets`) now use `privateGet` instead of `publicGet`. OKX's `/api/v5/public/event-contract/*` endpoints require auth headers despite the `/public/` path prefix; unauthenticated calls returned 401.

---

## [1.3.0] - 2026-04-08

### Added

- **`market_list_indicators` MCP tool and `okx market indicator list` CLI command**: Browse all supported OKX market indicators grouped by category, with range-filter support (`--fearGreedIndexMin/Max`, `--longShortRatioMin/Max`, etc.) for AI-driven sentiment screening. (#124)
- **Market tools `demo` parameter**: All market MCP tools now accept an optional `demo: boolean` parameter; CLI market commands respect the global `--demo` flag. Enables explicit querying of simulated-trading market data independently of the server's demo mode.
- **Simple Earn Fixed (定期赚币) tools** (`earn.savings`): Three new tools — `earn_get_fixed_order_list`, `earn_fixed_purchase` (two-step: preview then confirm), `earn_fixed_redeem`. `earn_get_lending_rate_history` now also returns fixed-term offers with APR, term, min amount, and remaining quota. CLI: `okx earn savings fixed-orders/fixed-purchase/fixed-redeem`.
- **Margin-cost order mode (`tgtCcy=margin`)**: SWAP, FUTURES, and options place/algo order tools now accept `tgtCcy=margin`, where `sz` represents the USDT margin cost. The system automatically queries current leverage and converts to contract count (`contracts = floor(margin × lever / (ctVal × lastPx))`). (#128)
- **CLI audit logging**: CLI writes audit logs to `~/.okx/logs/trade-YYYY-MM-DD.log` for all tool executions, matching MCP server behavior. `okx account audit-log` now works for CLI users. (#129)
- **`skills_download` `format` parameter**: Accepts `"zip"` or `"skill"`. MCP defaults to `"skill"` (agent-friendly extension), CLI defaults to `"zip"` (backward-compatible). File content is identical.

### Changed

- **CLI table output shows environment header**: Table output now displays an `Environment: live` / `Environment: demo (simulated trading)` header line.
- **`earn_get_lending_rate_history` fetches fixed-term offers**: Makes an additional best-effort `privateGet` call; falls back gracefully (empty `fixedOffers`) when no API key is configured.
- **`earn_get_lending_rate_history` default limit reduced from 100 to 7**: Reduces token usage in agent conversations.

### Fixed

- **Indicator range-filter code mapping**: Corrected internal code mappings and removed unsupported indicator types, preventing silent empty results.
- **Skills docs indicator sync**: Updated all indicator descriptions and examples to match live backend schema and new CLI commands.
- **Skills docs account transfer type codes**: Corrected `6`=funding / `18`=trading in portfolio and earn docs — previously reversed. (#126)
- **`tgtCcy=quote_ccy` conversion uses `minSz`/`lotSz`**: Rounds down to `lotSz` precision and validates against `minSz` instead of assuming integer contracts, fixing false "too small" errors for instruments with `minSz < 1` (e.g. BTC-USDT-SWAP). (#127)
- **CLI `--json` env wrapper is now opt-in via `--env` flag**: `--json` returns raw data by default (backward-compatible). Use `--json --env` for the `{env, profile, data}` wrapper. (#131)
- **Unknown `tgtCcy` values throw `ValidationError`**: Only `base_ccy`, `quote_ccy`, and `margin` are accepted; other values throw with a helpful suggestion instead of silently passing through. (#133)
- **`--verbose` flag now affects CLI audit log output**: Verbose mode writes a `debug`-level entry with full request args and response; non-verbose records a compact summary only. (#130)
- **Market data defaults to live regardless of server demo mode**: Market tools explicitly override the server-level demo flag, always returning live data unless `demo: true` is passed explicitly.

---

## [1.3.0-beta.5] - 2026-04-08

### Added

- **Skill download `format` parameter**: `skills_download` MCP tool and `okx skill download` CLI command now accept a `format` option (`"zip"` or `"skill"`). MCP defaults to `"skill"` (so agents like Claude Desktop can auto-detect the file type), CLI defaults to `"zip"` (backward-compatible). The file content is identical — only the extension changes.
- **Market tools `demo` parameter**: All 14 market MCP tools now accept an optional `demo: boolean` parameter, and CLI market commands now respect the global `--demo` flag. When `demo=true` / `--demo`, the request targets OKX's simulated trading market data environment (`x-simulated-trading: 1`). When omitted or `false` (default), live market data is always returned — independent of whether the server is started with `--demo`.

### Fixed

- **Market data defaults to live regardless of server demo mode**: Previously, starting the server with `--demo` caused all market data requests to return simulated trading data. Now market tools explicitly pass `simulatedTrading: false` by default, overriding the server-level demo flag. Users can pass `demo: true` to explicitly query simulated market data. Other modules (trading, account, earn, indicators) are unaffected and continue to follow the server demo flag.
- **Unknown `tgtCcy` values now throw `ValidationError` instead of silent passthrough**: Previously, typos like `--tgtCcy margin_ccy` or `--tgtCcy QUOTE_CCY` were silently ignored and `sz` was sent to the API unconverted. Now only `base_ccy`, `quote_ccy`, and `margin` are accepted; any other value throws a `ValidationError` with a helpful suggestion. (#133)
- **`--verbose` flag now affects CLI audit log output**: Previously, `TradeLogger` was always constructed with `"info"` level and all success logs used `"info"`, so `--verbose` had no effect on log file content. Now, verbose mode sets log level to `"debug"` and writes an additional debug-level entry with full request args and response data for each successful tool call, while non-verbose mode only records a compact summary. (#130)

---

## [1.3.0-beta.4] - 2026-04-08

### Added

- **DoH (DNS-over-HTTPS) proxy for REST API requests**: When the OKX API domain is unreachable via direct connection (e.g. DNS poisoning), the SDK now transparently resolves an alternative proxy node through a local `okx-pilot` binary. Cache-first strategy: first request attempts direct connection; on network failure the binary is invoked and the result is cached. Subsequent requests reuse the cached node with zero overhead. Failed proxy nodes are automatically excluded and re-resolved. Supports `--verbose` logging for full DoH lifecycle visibility.
- **Automatic DoH binary download on install**: `postinstall` now downloads the platform-specific `okx-pilot` binary from CDN (with multi-source fallback) to `~/.okx/bin/`. Best-effort — never blocks `npm install`. Supports darwin-arm64, darwin-x64, linux-x64, and win32-x64.

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

- **`news` module removed pending compliance approval**: The Orbit News API integration introduced in [1.2.8-beta.4] has been reverted. All news tools (`news_get_latest`, `news_get_by_coin`, `news_search`, `news_get_detail`, `news_get_domains`, `news_get_coin_sentiment`, `news_get_sentiment_ranking`), CLI commands (`okx news …`), and the `okx-sentiment-tracker` agent skill have been removed until regulatory compliance approval is obtained. The `skills` (Skill Marketplace) module is unaffected.

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
  - Agent Skill: `skills/okx-sentiment-tracker/` with workflows guide.

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
