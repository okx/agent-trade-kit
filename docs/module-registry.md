# Module Registry

All MCP modules must be registered here before implementation can be merged to master.
Unregistered modules will be rejected during review.

**Token Budget:** 25,000 tokens | **Current Usage:** ~44,974 tokens | **Over budget:** ~19,974 tokens | **Tools:** 159 (97 read / 62 write)

> Token 估算由 `npx tsx scripts/mcp-token-stats.ts` 生成（JSON schema 字符数 / 3.5）。readOnly 模式下 97 工具, ~22,523 tokens (under budget)。

## Registered Modules

| Module ID | Status | Tools | Read | Write | Token Est. | Design Doc | Approved By | Date |
|-----------|--------|-------|------|-------|------------|------------|-------------|------|
| futures | ✅ approved | 18 | 6 | 12 | ~5,453 | _(founding module)_ | @Jasmine.Li | — |
| swap | ✅ approved | 17 | 6 | 11 | ~5,387 | _(founding module)_ | @Jasmine.Li | — |
| market | ✅ approved | 19 | 19 | 0 | ~5,336 | _(founding module)_ | @Jasmine.Li | — |
| smartmoney | ✅ approved | 10 | 10 | 0 | ~4,729 | [smartmoney](designs/smartmoney.md) | @Jasmine.Li | 2026-04-30 |
| spot | ✅ approved | 14 | 4 | 10 | ~4,127 | _(founding module)_ | @Jasmine.Li | — |
| option | ✅ approved | 14 | 7 | 7 | ~3,284 | _(founding module)_ | @Jasmine.Li | — |
| account | ✅ approved | 14 | 12 | 2 | ~2,759 | _(founding module)_ | @Jasmine.Li | — |
| event | ✅ approved | 9 | 6 | 3 | ~2,607 | [event](modules/event.md) | @Jasmine.Li | 2026-03-30 |
| news | ✅ approved | 7 | 7 | 0 | ~2,552 | [design doc](designs/news.md) | @Chen.Gong | 2026-03-24 |
| bot.grid | ✅ approved | 6 | 3 | 3 | ~2,218 | _(founding module)_ | @Jasmine.Li | — |
| earn.savings | ✅ approved | 9 | 4 | 5 | ~2,020 | _(founding module)_ | @Jasmine.Li | — |
| bot.dca | ✅ approved | 5 | 3 | 2 | ~1,341 | _(founding module)_ | @Jasmine.Li | — |
| earn.dcd | ✅ approved | 6 | 4 | 2 | ~1,183 | _(founding module)_ | @Jasmine.Li | — |
| earn.onchain | ✅ approved | 6 | 3 | 3 | ~993 | _(founding module)_ | @Jasmine.Li | — |
| skills | ✅ approved | 3 | 2 | 1 | ~614 | [doc](modules/skills.md) | @Jasmine.Li | 2026-03-28 |
| earn.autoearn | ✅ approved | 1 | 0 | 1 | ~223 | [auto-earn](designs/auto-earn.md) | @Jasmine.Li | 2026-03-24 |
| earn.flash | ✅ approved | 1 | 1 | 0 | ~148 | [flash-earn](designs/flash-earn.md) | @Jasmine.Li | 2026-04-09 |
| **Total** | | **159** | **97** | **62** | **~44,974** | | | |

> **smartmoney over 5–8 tool budget — approved exception:** the surface is split by **business scenario** (`_by_filter` = tier-driven discovery, full pool-filter knobs exposed; `_by_trader` = authorIds-direct-lookup, pool-filter knobs hidden, backend defaults applied) so the two siblings have **disjoint inputSchemas** and AI agents disambiguate from the schema alone (no negative-space description rules). Per-scenario atomicity is the minimum granular set; further consolidation re-introduces the multi-mode footgun fixed in 2026-04-29 redesign (see `docs/designs/smartmoney.md` §2 + §13). 2026-04-30 net: +`smartmoney_search_trader` (nickname → authorId resolver), −`smartmoney_get_top_coin_signals` (subsumed by `signal_overview_by_filter` with `topInstruments` default). 2026-05-06 net: `_by_trader` siblings dropped 7 pool-filter params each (sortBy / period / pnlTier / winRateTier / maxDrawdownTier / aumTier / lmtNum). Module remains well under the per-module ≤25,000 budget and shares `outputSchema` fragments via `TRADER_ITEM_PROPS` / `SIGNAL_ITEM_PROPS` to keep growth amortized.

## Status Legend

| Status | Meaning |
|--------|---------|
| 📝 proposed | Design doc submitted, pending TL approval |
| ✅ approved | Design approved, implementation can proceed or is merged |
| ❌ reverted | Was approved but later removed from codebase |
| ⏸️ deferred | Approved in principle, deferred to future release |

## How to Add a New Module

1. Submit a **docs-only MR** that adds a row here (status: `📝 proposed`) and a design doc under `docs/designs/`
2. Get TL approval on the design MR
3. Submit implementation MR — update status to `✅ approved` in the same MR
4. Reviewer will verify this registry entry exists and is approved before merging

See [MCP Design Guideline](mcp-design-guideline.md) for full design rules.

## Proposed / Deferred Modules

| Module ID | Status | Tools (est.) | Token Est. | Design Doc | Approved By | Date |
|-----------|--------|--------------|------------|------------|-------------|------|
| earn.auto | 📝 proposed | 5 | ~1,000 | [doc](modules/earn.auto.md) | — | — |
