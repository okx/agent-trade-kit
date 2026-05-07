## Summary

<!-- Brief description of what this MR does -->

## Module(s) Changed

<!-- Check all that apply -->
- [ ] market
- [ ] spot
- [ ] swap
- [ ] futures
- [ ] option
- [ ] account
- [ ] event
- [ ] news
- [ ] smartmoney
- [ ] earn (savings / onchain / dcd / autoearn / flash)
- [ ] bot (grid / dca)
- [ ] skills
- [ ] infra / config / other (no probe required)

## Checklist

### Code Quality
- [ ] `pnpm build && pnpm typecheck && pnpm test:unit` passes locally
- [ ] Follows [MCP Design Guideline](docs/mcp-design-guideline.md) (naming, token budget, descriptions)
- [ ] New module registered in [Module Registry](docs/module-registry.md) (if adding new module)

### Eval Probe (required for every new/modified MCP tool)
- [ ] Added probe file at `eval/probes/<module>/tier2-<tool-name>.live.test.ts`
- [ ] Probe uses trace-based assertion: `findToolCall(trace, { commandPatterns })` to verify the agent invoked the expected `okx <module> <subcommand>` with the right parameters
- [ ] Probe imports from `@eval/shared/eval-helpers.js`
- [ ] Probe runs safely with `OKX_ENV=demo` / `OKX_DRY_RUN=1`

**Probe location by module:**

| Module | Directory |
|--------|-----------|
| market | `eval/probes/market/` |
| spot | `eval/probes/spot/` |
| swap | `eval/probes/swap/` |
| futures | `eval/probes/futures/` |
| option | `eval/probes/option/` |
| account | `eval/probes/account/` |
| event | `eval/probes/event/` |
| news | `eval/probes/news/` |
| smartmoney | `eval/probes/smartmoney/` |
| earn.savings | `eval/probes/earn/savings/` |
| earn.onchain | `eval/probes/earn/onchain/` |
| earn.dcd | `eval/probes/earn/dcd/` |
| earn.autoearn | `eval/probes/earn/autoearn/` |
| earn.flash | `eval/probes/earn/flash/` |
| bot.grid | `eval/probes/bot/grid/` |
| bot.dca | `eval/probes/bot/dca/` |
| skills | `eval/probes/skills/` |

### Documentation
- [ ] Updated CHANGELOG.md
- [ ] Updated relevant docs (if behavior changes)

## Test Evidence

<!-- Paste eval run URL or probe output if available -->
