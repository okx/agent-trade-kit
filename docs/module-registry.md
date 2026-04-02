# Module Registry

All MCP modules must be registered here before implementation can be merged to master.
Unregistered modules will be rejected during review.

**Token Budget:** 25,000 tokens | **Current Usage:** ~23,927 tokens | **Remaining:** ~1,073 tokens

## Registered Modules

| Module ID | Status | Tools | Read | Write | Token Est. | Design Doc | Approved By | Date |
|-----------|--------|-------|------|-------|------------|------------|-------------|------|
| market | ✅ approved | 14 | 14 | 0 | ~2,060 | _(founding module)_ | @Jasmine.Li | — |
| spot | ✅ approved | 16 | 5 | 11 | ~2,800 | _(founding module)_ | @Jasmine.Li | — |
| swap | ✅ approved | 18 | 7 | 11 | ~3,100 | _(founding module)_ | @Jasmine.Li | — |
| futures | ✅ approved | 18 | 7 | 11 | ~3,100 | _(founding module)_ | @Jasmine.Li | — |
| option | ✅ approved | 17 | 8 | 9 | ~2,900 | _(founding module)_ | @Jasmine.Li | — |
| account | ✅ approved | 14 | 12 | 2 | ~2,500 | _(founding module)_ | @Jasmine.Li | — |
| bot.grid | ✅ approved | 5 | 3 | 2 | ~1,200 | _(founding module)_ | @Jasmine.Li | — |
| bot.dca | ✅ approved | 5 | 3 | 2 | ~1,200 | _(founding module)_ | @Jasmine.Li | — |
| earn.savings | ✅ approved | 8 | 4 | 4 | ~1,500 | _(founding module)_ | @Jasmine.Li | — |
| earn.onchain | ✅ approved | 7 | 3 | 4 | ~1,400 | _(founding module)_ | @Jasmine.Li | — |
| earn.dcd | ✅ approved | 5 | 3 | 2 | ~1,100 | _(founding module)_ | @Jasmine.Li | — |
| earn.autoearn | ✅ approved | 1 | 0 | 1 | ~167 | [auto-earn](designs/auto-earn.md) | @Jasmine.Li | 2026-03-24 |
| audit | ✅ approved | 1 | 1 | 0 | ~200 | _(founding module)_ | @Jasmine.Li | — |
| news | ✅ approved | 7 | 7 | 0 | ~1,400 | [design doc](designs/news.md) | @Chen.Gong | 2026-03-24 |
| skills | ✅ approved | 3 | 2 | 1 | ~500 | [doc](modules/skills.md) | @Jasmine.Li | 2026-03-28 |
| **Total** | | **139** | **80** | **59** | **~23,927** | | | |

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
