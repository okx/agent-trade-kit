<!-- triggers: quality, testing, coverage, node:test, pre-MR, checklist, review, drift, smoke-test, CLI routing, ToolRunner, spy, isWrite, readOnly, compliance, audit -->
# Testing & Quality Assurance

## Test Infrastructure

Tests use Node.js built-in `node:test` runner (no Jest/Vitest). Run with: `pnpm test:unit`.

For current test file counts, see `context-kg/technical/01-architecture.md` — Test Structure section.

## CLI Parameter Routing Test Pattern

**Problem this solves**: In March 2026 (#78), a refactor mistakenly used `rest[0]` (positional arg) instead of `flags.instId` (named flag), silently breaking `--instId` for 11 days.

**Pattern**: Use a spy `ToolRunner` to capture the exact args object passed to the tool handler. Assert that key parameters come from named flags (`v.instId`, `v.side`, etc.), never from positional args.

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleSpotCommand } from "../src/index.js";

// Inline spy factory — each test file defines its own, no shared helper exists
function makeSpy() {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    return { endpoint: "POST /api/v5/trade/order", requestTime: "", data: [{ ordId: "1", sCode: "0", sMsg: "" }] };
  };
  return { spy, captured };
}

it("spot place-order routes --instId via named flag", async () => {
  const { spy, captured } = makeSpy();
  await handleSpotCommand(spy, "place-order", [], { instId: "BTC-USDT", side: "buy", sz: "1", ordType: "market" } as never, false);
  assert.strictEqual(captured.args["instId"], "BTC-USDT");
});
```

Every new CLI command that routes `instId`, `ordId`, or other critical identifiers **must** have a corresponding routing test.

## Bidirectional Drift Test

`packages/cli/test/drift.test.ts` verifies that the CLI command registry and the core ToolSpec registry stay in sync. It checks:
1. Every CLI command maps to a tool name that exists in the ToolSpec registry
2. Every registered ToolSpec has a corresponding CLI command (or is intentionally CLI-excluded)

This test catches MCP ↔ CLI parity regressions immediately at CI time rather than at runtime.

## Pre-MR Checklist

Before opening an MR, verify:

1. **CHANGELOG.md** — add entry under `[Unreleased]` for any user-facing change (both `CHANGELOG.md` and `CHANGELOG.zh-CN.md`)
2. **Tests** — `pnpm test:unit` passes with all new behavior covered
3. **Build** — `pnpm build` compiles without errors
4. **Typecheck** — `pnpm typecheck` reports no type errors
5. **MCP ↔ CLI parity** — if an MCP tool was added/modified, the CLI command is updated too (and vice versa)
6. **Skills sync** — if CLI output format or parameters changed, `SKILL.md` and `skills/` files updated
7. **Knowledge base** — if a new subsystem or major architectural change is introduced, update `context-kg/`

## CI Pipeline

The CI pipeline (`.gitlab-ci.yml`) runs on every push:
1. `pnpm install` — dependency installation
2. `pnpm build` — TypeScript compilation via tsup
3. `pnpm typecheck` — tsc type checking (no emit)
4. `pnpm test:unit` — unit tests

A separate smoke test workflow (`.github/workflows/smoke-test.yml`) runs on push to master and via manual dispatch against the live OKX demo API to verify end-to-end request signing, tool dispatch, and response parsing.

## Smoke Test Workflow

The smoke tests (`scripts/smoke-test/run.ts`) are excluded from `pnpm test:unit` (which runs only unit tests). They require live API credentials and are triggered by CI or run manually.

Smoke test coverage goals:
- One happy-path test per instrument type (spot, swap, futures, option)
- One test for each `tgtCcy` mode (`base_ccy`, `quote_ccy`, `margin`)
- DoH binary download and `okx doh status` command

## Code Quality Constraints

Static analysis (SonarQube) enforces:
- **Cognitive Complexity ≤ 15** per function
- **No nested ternary expressions**
- **No duplicate imports**
- **No duplicated code blocks** — extract shared helpers

## Security & Compliance

- **Credentials never logged**: API key, secret, and passphrase must not appear in logs, error messages, or tool outputs
- **Write-operation confirmation**: tools with `isWrite: true` require explicit user intent before execution. The `readOnly` mode removes all `isWrite` tools from the registry, providing a safe analysis surface for users with read-only API keys
- **Audit logging**: CLI writes tool execution records to `~/.okx/logs/trade-YYYY-MM-DD.log`. MCP server behavior is mirrored for CLI parity (#129)
- **HMAC signing**: all API requests are signed client-side (`packages/core/src/client/rest-client.ts`). The signature is timestamp-bound (OKX rejects requests > 30 seconds old)

## Known Structure Issues (as of v1.3.1, architectural review 2026-04-07)

- **P0**: Module registry sync (`docs/module-registry.md`) — registry may list stale tool counts; run `pnpm test:unit` to verify current active tool count (currently 147 via `allToolSpecs()`)
- **P1**: `packages/cli/src/index.ts` has grown to ~1374 lines (multi-responsibility)
- **P2**: Token budget across all tool descriptions approaching the 25,000 token ceiling; monitor with each new tool addition
