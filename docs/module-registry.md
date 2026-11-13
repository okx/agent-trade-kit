# Module Registry

All MCP modules must be registered here before implementation can be merged to master.
Unregistered modules will be rejected during review.

**Token Budget:** 25,000 tokens | **Current Usage:** ~53,919 tokens | **Over budget:** ~28,919 tokens | **Tools:** 183 (108 read / 75 write)

> Token 估算由 `npx tsx scripts/mcp-token-stats.ts` 生成（JSON schema 字符数 / 3.5）。readOnly 模式下 104 工具, ~26,251 tokens (over budget)。
>
> ⚠️ 本次仅重算了 bot.grid（真实脚本值 ~3,131，此前手动维护的 ~2,705 已漂移）。其余模块的 Token Est. 列与真实脚本输出存在系统性偏离（如 smartmoney、news），Total/readOnly 亦待全表 regenerate — 见 #206。

> **bot.smartportfolio +4 tools (ALGO-49154, issue #225)** — measured with the same method on the base commit (84932bef) and this branch (JSON `name + description + inputSchema` characters / 3.5, MCP-loadable modules only): module 8 → 12 tools (read 4, write 4 → 8), ~1,823 → ~2,795 tokens (**+972**); global 179 → 183 tools, ~47,633 → ~48,605 (**+972**) by that method. The table keeps the registry's historical basis, so its row/total are the previous values **+972** (module ~2,800 → ~3,770, total ~52,947 → ~53,919). The 25,000 global budget was already exceeded before this change (see #206); the +972 does not cause the overrun and nothing was trimmed to offset it — the confirmation, no-recommendation and balance-risk rules live in the Skill, not in tool descriptions. readOnly mode is unchanged (all four new tools are write tools).

## Registered Modules

| Module ID | Status | Tools | Read | Write | Token Est. | Design Doc | Approved By | Date |
|-----------|--------|-------|------|-------|------------|------------|-------------|------|
| smartmoney | ✅ approved | 10 | 10 | 0 | ~5,759 | [smartmoney](designs/smartmoney.md) | @Jasmine.Li | 2026-04-30 |
| futures | ✅ approved | 18 | 6 | 12 | ~5,453 | _(founding module)_ | @Jasmine.Li | — |
| swap | ✅ approved | 17 | 6 | 11 | ~5,387 | _(founding module)_ | @Jasmine.Li | — |
| market | ✅ approved | 20 | 20 | 0 | ~5,606 | _(founding module)_ | @Jasmine.Li | — |
| spot | ✅ approved | 14 | 4 | 10 | ~4,127 | _(founding module)_ | @Jasmine.Li | — |
| option | ✅ approved | 14 | 7 | 7 | ~3,284 | _(founding module)_ | @Jasmine.Li | — |
| account | ✅ approved | 15 | 13 | 2 | ~3,240 | _(founding module)_ | @Jasmine.Li | — |
| event | ✅ approved | 9 | 6 | 3 | ~2,655 | [event](modules/event.md) | @Jasmine.Li | 2026-03-30 |
| news | ✅ approved | 9 | 9 | 0 | ~3,352 | [design doc](designs/news.md) | @Chen.Gong | 2026-03-24 |
| bot.grid | ✅ approved | 9 | 5 | 4 | ~3,131 | _(founding module)_ | @Jasmine.Li | — |
| earn.savings | ✅ approved | 10 | 5 | 5 | ~2,300 | _(founding module)_ | @Jasmine.Li | — |
| bot.dca | ✅ approved | 9 | 4 | 5 | ~1,783 | _(founding module)_ | @Jasmine.Li | — |
| bot.smartportfolio | ✅ approved | 12 | 4 | 8 | ~3,770 | [smart-portfolio](designs/smart-portfolio.md) | — | 2026-11-13 |
| bot.recurring | ✅ approved | 0 MCP _(12 CLI-only)_ | 3 | 9 | 0 _(CLI-only)_ | [recurring](designs/recurring.md) | TL (issue #223) | 2026-10-22 |
| earn.dcd | ✅ approved | 6 | 4 | 2 | ~1,183 | _(founding module)_ | @Jasmine.Li | — |
| earn.onchain | ✅ approved | 6 | 3 | 3 | ~993 | _(founding module)_ | @Jasmine.Li | — |
| skills | ✅ approved | 3 | 2 | 1 | ~614 | [doc](modules/skills.md) | @Jasmine.Li | 2026-03-28 |
| earn.autoearn | ✅ approved | 1 | 0 | 1 | ~223 | [auto-earn](designs/auto-earn.md) | @Jasmine.Li | 2026-03-24 |
| earn.flash | ✅ approved | 1 | 1 | 0 | ~148 | [flash-earn](designs/flash-earn.md) | @Jasmine.Li | 2026-04-09 |
| **Total** | | **183** | **108** | **75** | **~53,919** | | | |

> **CLI-only modules** (`bot.recurring`, see `CLI_ONLY_MODULE_IDS` in `packages/core/src/constants.ts`) are registered here for governance but expose **no MCP tools**: they are outside `MODULES`, so the MCP tool count, token budget and the "authoritative count" above (183 tools / 18 modules) are unchanged. The Tools/Read/Write columns of such rows show the 12 CLI-backing specs (3 read / 9 write).

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
