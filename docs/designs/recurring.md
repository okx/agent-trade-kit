# Design: Recurring Buy (定投) — CLI-only module `bot.recurring`

Issue #223 · Jira ALGO-47987 · Status: approved (module-registry row `bot.recurring`).

## Goal

Expose the OKX Recurring Buy lifecycle (create, list, details, sub-orders, pause/restart/stop, four amends, add-investment) as `okx bot recurring <sub>` CLI commands. Per TL decision there are **no MCP tools** for this module, so the MCP tool list, `system_get_capabilities` and `--modules` are unchanged (178 tools, 18 modules).

## Design

- `packages/core/src/tools/bot/recurring.ts` — 12 `ToolSpec`s in module `bot.recurring`, plus `recurring-validation.ts` (table-driven schedule/list validation) and `write-result.ts` (sCode handling that treats empty `data` as success).
- **CLI-only mechanism (option A′)**: `CLI_ONLY_MODULE_IDS = ["bot.recurring"]` in `constants.ts`; the id is *not* in `MODULES` / `BOT_SUB_MODULE_IDS` / defaults. `config.modules` is validated against `MODULES`, so it can never contain the id, and the existing `buildTools` filter (`config.modules ∩ spec.module`) excludes the specs from MCP with zero new filter code. `ToolSpec.module` widens to `ModuleId | CliOnlyModuleId`. The CLI runner ignores module gating, so the specs stay reachable (and keep write audit logging, `--aiBuilderCode` handling and the CLI↔ToolSpec drift guard).
- CLI: `commands/bot-recurring.ts` (separate file to keep `bot.ts` focused), `handleBotRecurringCommand` in `index.ts`, `cli-registry.ts` subgroup, new parser flags, and `parseCli` pre-processing so `--timeZone -5` works.

### Alternatives rejected

- `cliOnly` flag on `ToolSpec` + `buildTools` filter: new shared field and leaks in capability snapshot / `--modules` hints.
- Handlers inside `packages/cli` bypassing `ToolSpec`: loses audit logging, builder-code tagging and the drift guard.
- Defaulting/auto-detecting `tdMode` in code: rejected by the TL; the skill documents the `acctLv` mapping instead.

## Risks

- Widening `ToolSpec.module` touches shared types → regression tests (`recurring.test.ts`, `packages/mcp/test/server.test.ts`) assert no `recurring_*` tool is ever listed or callable over MCP.
- `allToolSpecs()` is a public export and now includes CLI-only specs; custom servers must go through `buildTools(config)`.
- Real-API behaviour (empty-data endpoints, array stop body) is covered by unit tests on the request/response shape; live verification is a manual smoke on a demo account.
