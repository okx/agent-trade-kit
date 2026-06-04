## Unit Test Report — OPRS-387 (gnjld4bg2omqd7xqqfolzd1pgue)

Market filter / indicator CLI bug-fix (spec §2, §6, §7, §8, §9)

### Summary

- Lint: N/A (no lint command configured)
- Typecheck: PASS
- Unit tests: PASS — 2909 total, 2909 passed, 0 failed
  - `@agent-tradekit/core`: 1291 pass, 0 fail
  - `@okx_ai/okx-trade-cli`: 1593 pass, 0 fail
  - `@okx_ai/okx-trade-mcp`: 25 pass, 0 fail
- Dev server: N/A (CLI/MCP service — no web server)

> Note: Typecheck required a prior `pnpm --filter @agent-tradekit/core build` step because the CLI package resolves `@agent-tradekit/core` from its compiled dist. The source barrel export (`packages/core/src/index.ts`) already contained `getDefaultIndicatorParams`; the error was a stale build artifact.

---

### New Test Cases

Tests introduced by this requirement (files with `git diff HEAD` changes):

| File | Suite | Test Name | Result |
|------|-------|-----------|--------|
| `packages/cli/test/indicator.test.ts` | `cmdMarketIndicator - formatter` | applies the core default paramList when params string is empty (Plan B) | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketFilter` | outputs 'No results' and 'Total: 0' when rows are empty | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketFilter` | outputs table with rows and correct Total for SPOT (no fundingRate column) | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketFilter` | outputs JSON unchanged (full getData(result) array) when json=true | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketIndicator` | Plan A: prints the exact hint (never silent) when every timeframe is empty | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketIndicator` | Plan A: non-period indicator (obv) with empty result prints the hint, no default substituted | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketIndicator` | Plan B routing: omitting --params for ema sends the core default [14] (via named flag, not positional) | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketIndicator` | explicit --params wins: --params 2 sends [2] (no regression, no default override) | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketIndicator` | Plan B render: when default yields values, the loop renders them (no hint printed) | PASS |
| `packages/cli/test/market.test.ts` | `cmdMarketIndicator` | Plan B render --list: renders a table of values when --list is set | PASS |
| `packages/core/test/indicator.test.ts` | `DEFAULT_INDICATOR_PARAMS` | ema/ma/wma/rsi default to [14] (PRD example) | PASS |
| `packages/core/test/indicator.test.ts` | `DEFAULT_INDICATOR_PARAMS` | macd defaults to [12, 26, 9] (PRD example) | PASS |
| `packages/core/test/indicator.test.ts` | `DEFAULT_INDICATOR_PARAMS` | bb defaults to [20, 2] (PRD example) | PASS |
| `packages/core/test/indicator.test.ts` | `DEFAULT_INDICATOR_PARAMS` | does not contain non-period indicators (obv, vwap, sar, ad) | PASS |
| `packages/core/test/indicator.test.ts` | `DEFAULT_INDICATOR_PARAMS` | every key is a known indicator name (no typos) | PASS |
| `packages/core/test/indicator.test.ts` | `DEFAULT_INDICATOR_PARAMS` | every value is a non-empty array of numbers | PASS |
| `packages/core/test/indicator.test.ts` | `getDefaultIndicatorParams` | resolves lowercase period indicators | PASS |
| `packages/core/test/indicator.test.ts` | `getDefaultIndicatorParams` | is case-insensitive (uppercase input) | PASS |
| `packages/core/test/indicator.test.ts` | `getDefaultIndicatorParams` | resolves the boll -> bb alias to [20, 2] | PASS |
| `packages/core/test/indicator.test.ts` | `getDefaultIndicatorParams` | returns undefined for non-period indicators | PASS |
| `packages/core/test/indicator.test.ts` | `getDefaultIndicatorParams` | returns undefined for unknown names | PASS |
| `packages/core/test/indicator.test.ts` | `registerIndicatorTools - tool spec` | market_get_indicator: params description no longer claims server defaults | PASS |

**Total new test cases: 22**

---

### Test Assertion Fixes (Code Review P1, not new test cases)

These were existing test stubs strengthened by Stage 6 (code review) before this stage ran:

| File | Change |
|------|--------|
| `packages/cli/test/indicator.test.ts:232` | Replaced vacuous `assert.ok(!output.includes("RSI") \|\| output === "")` with positive assertions: `output.includes("No indicator values returned")` and `!output.includes("RSI")` |
| `packages/cli/test/indicator.test.ts:237` | Corrected stale comment (empty string is falsy → ternary short-circuits; the split never runs) |

---

### Failures

None.

---

### Raw Output (trimmed — last 50 lines)

```
✔ cmdUpgrade (14.474575ms)
ℹ tests 1593
ℹ suites 356
ℹ pass 1593
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 263032.032944
$ node --import tsx/esm --test --test-reporter=spec test/*.test.ts
▶ MCP bundle integrity
  ✔ noExternal packages should be inlined, not imported externally (0.818377ms)
  ✔ all external imports must be declared in dependencies (0.113914ms)
✔ MCP bundle integrity (1.608685ms)
▶ createServer
  ✔ lists tools including system_get_capabilities (16.397053ms)
  ✔ system_get_capabilities returns server info and module status (3.476728ms)
  ✔ returns error for unknown tool (2.38709ms)
  ✔ modules without auth show requires_auth status (1.736859ms)
  ✔ disabled modules show disabled status (1.922615ms)
  ✔ readOnly flag is reflected in capabilities (1.604834ms)
  ✔ server returns instructions containing remediation safeguard (1.18414ms)
✔ createServer (29.565097ms)
▶ WRITE_ACTION_PATTERN
  ✔ matches: "Cancel cross-margin TP/SL, trailing, trigger, and chase orde..." (0.818377ms)
  ...
✔ WRITE_ACTION_PATTERN (1.011295ms)
▶ applyRemediationWarning
  ✔ returns warning when message matches and no existing suggestion (0.088802ms)
  ✔ appends warning to existing suggestion when message matches (0.048212ms)
  ✔ returns original suggestion unchanged when message does not match (0.046462ms)
  ✔ returns undefined when no match and no existing suggestion (0.036511ms)
✔ applyRemediationWarning (0.29241ms)
ℹ tests 25
ℹ suites 4
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 468.854702
```

**Overall: PASS**
