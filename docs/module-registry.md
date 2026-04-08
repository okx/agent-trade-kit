# Module Registry

All MCP modules must be registered here before implementation can be merged to master.
Unregistered modules will be rejected during review.

**Token Budget:** 25,000 tokens | **Current Usage:** ~21,092 tokens | **Remaining:** ~3,908 tokens

## Registered Modules

| Module ID | Status | Tools | Read | Write | Token Est. | Design Doc | Approved By | Date |
|-----------|--------|-------|------|-------|------------|------------|-------------|------|
| futures | ✅ approved | 18 | 6 | 12 | ~2,990 | _(founding module)_ | @Jasmine.Li | — |
| swap | ✅ approved | 17 | 6 | 11 | ~2,820 | _(founding module)_ | @Jasmine.Li | — |
| market | ✅ approved | 16 | 16 | 0 | ~2,660 | _(founding module)_ | @Jasmine.Li | — |
| option | ✅ approved | 14 | 7 | 7 | ~2,320 | _(founding module)_ | @Jasmine.Li | — |
| account | ✅ approved | 14 | 12 | 2 | ~2,320 | _(founding module)_ | @Jasmine.Li | — |
| spot | ✅ approved | 13 | 4 | 9 | ~2,160 | _(founding module)_ | @Jasmine.Li | — |
| earn.savings | ✅ approved | 9 | 4 | 5 | ~1,500 | _(founding module)_ | @Jasmine.Li | — |
| earn.onchain | ✅ approved | 6 | 3 | 3 | ~1,000 | _(founding module)_ | @Jasmine.Li | — |
| earn.dcd | ✅ approved | 6 | 4 | 2 | ~1,000 | _(founding module)_ | @Jasmine.Li | — |
| bot.grid | ✅ approved | 5 | 3 | 2 | ~830 | _(founding module)_ | @Jasmine.Li | — |
| bot.dca | ✅ approved | 5 | 3 | 2 | ~830 | _(founding module)_ | @Jasmine.Li | — |
| skills | ✅ approved | 3 | 2 | 1 | ~500 | [doc](modules/skills.md) | @Jasmine.Li | 2026-03-28 |
| earn.autoearn | ✅ approved | 1 | 0 | 1 | ~165 | [auto-earn](designs/auto-earn.md) | @Jasmine.Li | 2026-03-24 |
| **Total** | | **127** | **70** | **57** | **~21,092** | | | |

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
| event | 📝 proposed | 9 | ~1,800 | [doc](modules/event.md) | — | — |
| earn.auto | 📝 proposed | 5 | ~1,000 | [doc](modules/earn.auto.md) | — | — |
| news | ⏸️ deferred | 10 | ~2,000 | [doc](modules/news.md) | — | — |
