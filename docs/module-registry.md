# Module Registry

All MCP modules must be registered here before implementation can be merged to master.
Unregistered modules will be rejected during review.

**Token Budget:** 25,000 tokens | **Current Usage:** ~47,074 tokens | **Over budget:** ~22,074 tokens | **Tools:** 162 (100 read / 62 write)

> Token 估算由 `npx tsx scripts/mcp-token-stats.ts` 生成（JSON schema 字符数 / 3.5）。readOnly 模式下 99 工具, ~24,354 tokens (under budget)。

## Registered Modules

| Module ID | Status | Tools | Read | Write | Token Est. | Design Doc | Approved By | Date |
|-----------|--------|-------|------|-------|------------|------------|-------------|------|
| smartmoney | ✅ approved | 10 | 10 | 0 | ~5,759 | [smartmoney](designs/smartmoney.md) | @Jasmine.Li | 2026-04-30 |
| futures | ✅ approved | 18 | 6 | 12 | ~5,453 | _(founding module)_ | @Jasmine.Li | — |
| swap | ✅ approved | 17 | 6 | 11 | ~5,387 | _(founding module)_ | @Jasmine.Li | — |
| market | ✅ approved | 20 | 20 | 0 | ~5,606 | _(founding module)_ | @Jasmine.Li | — |
| spot | ✅ approved | 14 | 4 | 10 | ~4,127 | _(founding module)_ | @Jasmine.Li | — |
| option | ✅ approved | 14 | 7 | 7 | ~3,284 | _(founding module)_ | @Jasmine.Li | — |
| account | ✅ approved | 14 | 12 | 2 | ~2,759 | _(founding module)_ | @Jasmine.Li | — |
| event | ✅ approved | 9 | 6 | 3 | ~2,607 | [event](modules/event.md) | @Jasmine.Li | 2026-03-30 |
| news | ✅ approved | 9 | 9 | 0 | ~3,352 | [design doc](designs/news.md) | @Chen.Gong | 2026-03-24 |
| bot.grid | ✅ approved | 6 | 3 | 3 | ~2,218 | _(founding module)_ | @Jasmine.Li | — |
| earn.savings | ✅ approved | 9 | 4 | 5 | ~2,020 | _(founding module)_ | @Jasmine.Li | — |
| bot.dca | ✅ approved | 5 | 3 | 2 | ~1,341 | _(founding module)_ | @Jasmine.Li | — |
| earn.dcd | ✅ approved | 6 | 4 | 2 | ~1,183 | _(founding module)_ | @Jasmine.Li | — |
| earn.onchain | ✅ approved | 6 | 3 | 3 | ~993 | _(founding module)_ | @Jasmine.Li | — |
| skills | ✅ approved | 3 | 2 | 1 | ~614 | [doc](modules/skills.md) | @Jasmine.Li | 2026-03-28 |
| earn.autoearn | ✅ approved | 1 | 0 | 1 | ~223 | [auto-earn](designs/auto-earn.md) | @Jasmine.Li | 2026-03-24 |
| earn.flash | ✅ approved | 1 | 1 | 0 | ~148 | [flash-earn](designs/flash-earn.md) | @Jasmine.Li | 2026-04-09 |
| **Total** | | **162** | **100** | **62** | **~47,074** | | | |

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
