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
- Pilot binary download and `okx pilot status` command

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

## Test Runner Conventions (as of 2026-06-08, issue #199)

### Node-18-compatible tsx invocation

All `node:test` / coverage invocations must use `node_modules/.bin/tsx --test` (not `node --import tsx/esm --test`). The `--import tsx/esm` loader form requires Node >= 20.6 and breaks the OKG compliance Sonar pipeline which runs `npm ci + npm test` on a Node-18 scanner image (`okbase/sonar-scanner-node18`).

Correct pattern (matches root `test:coverage` and commit `9eb8e707`):
```
node_modules/.bin/tsx --test --test-reporter=spec test/*.test.ts
c8 --reporter=lcov --reporter=text --src=src node_modules/.bin/tsx --test test/*.test.ts
```

Forbidden (Node 20.6+ only):
```
node --import tsx/esm --test test/*.test.ts
```

### Per-test timeout — do NOT use the `--test-timeout` CLI flag

**Do not pass `--test-timeout=<ms>` to the test runner.** That CLI flag is Node 20+ only; the OKG Sonar scanner runs on Node 18 (`okbase/sonar-scanner-node18`) and rejects it with `bad option: --test-timeout`, exit code 9 — which means **zero tests run, no `coverage/lcov.info` is produced, and the SonarQube quality gate fails on 0% coverage** (regression introduced by MR !350, reverted in this fix). Node 18 has no equivalent global per-test-timeout CLI flag; if a hard per-test bound is ever needed, set the `timeout` option on individual `it()`/`describe()` calls, or wrap the whole command with coreutils `timeout` at the script level (Node-version-agnostic).

The actual de-flake mechanism is **test hermeticity** (below), not a timeout flag.

Historical context: the SonarQube CI job intermittently hung to the 3600 s timeout (evidence: jobs 29390764, 29406066, 29259551). Root cause: `undici-proxy-bootstrap.test.ts` made `fetch()` calls with no `AbortSignal`, which could hang indefinitely on runners with a corporate proxy env. The fix is the per-`fetch` `AbortSignal.timeout` + env/dispatcher isolation in the hermeticity rules below.

### Test hermeticity rules for tests making real I/O

Any test file that makes real network calls (even to loopback servers) must:

1. **Add `AbortSignal.timeout(<ms>)` to every `fetch()` call** — prevents a single blocked request from hanging the entire test file.
2. **Neutralise ambient proxy env vars at file scope** — wrap all tests in a top-level `before`/`after` pair that saves and deletes `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and their lowercase variants) before any test runs, then restores them afterward. Per-describe hooks may set the vars they need for their specific scenario.
3. **Capture and restore the global undici dispatcher** — save via `getGlobalDispatcher()` in the file-scope `before`, restore via `setGlobalDispatcher()` in the file-scope `after`. This ensures leaked dispatchers from a previous test run do not affect subsequent files.

Example file-scope hermeticity header (see `packages/core/test/undici-proxy-bootstrap.test.ts`):
```typescript
let _fileScopeDispatcher: Dispatcher;
let _fileHttpProxy: string | undefined;
let _fileHttpsProxy: string | undefined;
let _fileNoProxy: string | undefined;
let _fileHttpProxyLc: string | undefined;
let _fileHttpsProxyLc: string | undefined;
let _fileNoProxyLc: string | undefined;
before(() => {
  _fileScopeDispatcher = getGlobalDispatcher();
  _fileHttpProxy = process.env.HTTP_PROXY;   _fileHttpProxyLc = process.env.http_proxy;
  _fileHttpsProxy = process.env.HTTPS_PROXY; _fileHttpsProxyLc = process.env.https_proxy;
  _fileNoProxy = process.env.NO_PROXY;       _fileNoProxyLc = process.env.no_proxy;
  delete process.env.HTTP_PROXY; delete process.env.http_proxy;
  delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
  delete process.env.NO_PROXY; delete process.env.no_proxy;
});
after(() => {
  setGlobalDispatcher(_fileScopeDispatcher);
  if (_fileHttpProxy !== undefined) { process.env.HTTP_PROXY = _fileHttpProxy; } else { delete process.env.HTTP_PROXY; }
  if (_fileHttpsProxy !== undefined) { process.env.HTTPS_PROXY = _fileHttpsProxy; } else { delete process.env.HTTPS_PROXY; }
  if (_fileNoProxy !== undefined) { process.env.NO_PROXY = _fileNoProxy; } else { delete process.env.NO_PROXY; }
  if (_fileHttpProxyLc !== undefined) { process.env.http_proxy = _fileHttpProxyLc; } else { delete process.env.http_proxy; }
  if (_fileHttpsProxyLc !== undefined) { process.env.https_proxy = _fileHttpsProxyLc; } else { delete process.env.https_proxy; }
  if (_fileNoProxyLc !== undefined) { process.env.no_proxy = _fileNoProxyLc; } else { delete process.env.no_proxy; }
});
```
