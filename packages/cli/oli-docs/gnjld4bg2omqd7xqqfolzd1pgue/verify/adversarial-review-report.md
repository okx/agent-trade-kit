# Adversarial Review Report

**Date**: 2026-06-04
**Base ref**: master
**Spec loaded**: yes — packages/cli/oli-docs/gnjld4bg2omqd7xqqfolzd1pgue/spec.md
**Files reviewed**: 9 files, 344 insertions / 30 deletions
**Codex adversarial-review**: skipped — /codex:adversarial-review returned 'Unknown command'. Manual adversarial review performed on all changed files.

## Summary
- Total findings: 4
- To fix: 2
- Deferred (large change): 0
- Deferred (out of scope): 2

## Findings

### TOFIX
| # | File:Line | Severity | Description | Recommended action |
|---|-----------|----------|-------------|--------------------|
| 1 | packages/cli/test/indicator.test.ts:237 | P2 | Stale comment claims "Empty string splits to [''] → NaN, filtered out" but opts.params="" is falsy so the ternary returns undefined directly — the split never runs. Comment describes the wrong code path. | Update comment to: "Empty string is falsy → params=undefined (ternary short-circuits). Plan B then substitutes the core default." |
| 2 | packages/cli/test/indicator.test.ts:264 | P2 | After Plan A fix, output is never empty when all timeframes are empty (the hint is always printed). The assertion `assert.ok(!output.includes('RSI') \|\| output === '')` has a dead `output === ''` branch and does not positively assert the Plan A hint text, meaning a regression that drops the hint would go undetected. | Replace the assertion with: `assert.ok(output.includes('No indicator values returned'), 'Plan A hint must appear when all timeframes are empty')` and remove the dead `\|\| output === ''` branch. |

### DEFERRED — Large Change
| # | File:Line | Severity | Description | Recommended action |
|---|-----------|----------|-------------|--------------------|
| — | — | — | No large-change deferrals. | — |

### DEFERRED — Out of Scope
| # | File:Line | Severity | Description | Notes |
|---|-----------|----------|-------------|-------|
| 1 | packages/cli/src/commands/market.ts | P3 | `--params ,` (comma-only input) sends [0, 0] to the API instead of falling back to Plan B defaults, because Number('') === 0 passes the NaN filter and the length>0 guard. A user who accidentally provides only commas bypasses the default period substitution. | Pre-existing behavior in the params parsing logic not introduced by this diff. Would require adding a positive-value guard (e.g. values.every(n => n > 0)) to fix, which is a separate design decision. |
| 2 | packages/cli/src/commands/market.ts | P3 | cmdMarketFilter: `(Array.isArray(raw) ? raw[0] : raw)` silently discards index>0 elements if the API ever returns a multi-element array. Only the first element is rendered in text mode; --json is unaffected. | Intentional — matches the existing cmdMarketOiHistory pattern per CHANGELOG. API currently returns single-element arrays. Not a regression. |

## Raw Codex Output
<details>
<summary>Full adversarial review output</summary>

Manual adversarial review of diff against spec (Bug 1: array-unwrap in cmdMarketFilter; Bug 2: Plan A hint + Plan B default params in cmdMarketIndicator).

FINDING 1 (P2): packages/cli/test/indicator.test.ts:237 — stale comment describes wrong code path.
The comment says "Empty string splits to [''] → NaN, filtered out" but opts.params='' is falsy so the ternary takes the undefined branch directly; no split ever runs. The final effectiveParams=[14] is correct but the comment is misleading and could cause a future refactor to break silently.

FINDING 2 (P2): packages/cli/test/indicator.test.ts:264 — test assertion weakened by Plan A; `output === ''` branch is now dead.
The assertion `assert.ok(!output.includes('RSI') || output === '')` — after Plan A, the hint is always printed when no timeframe has values, so `output` is never empty. The `output === ''` disjunct is dead code. The test still passes (because `!output.includes('RSI')` is true), but it no longer guards the correct invariant; a test asserting the Plan A hint text would be stronger.

FINDING 3 (P3 — pre-existing, not introduced by diff): `--params ,` sends `[0, 0]` instead of Plan B defaults.
`Number('') === 0`, so splitting ',' on commas produces ['', ''] → [0, 0], which passes the NaN filter and the `length > 0` guard. This means a user who accidentally types `--params ,` will have explicit=[0,0] override Plan B rather than falling back to the default. Not introduced by this diff.

FINDING 4 (P3): cmdMarketFilter: raw[0] silently drops index>0 entries when the array has >1 element.
`const data = Array.isArray(raw) ? raw[0] : raw` — if the API ever returns a multi-element array, only the first is rendered in text mode. --json is unaffected (sends full raw). Matches cmdMarketOiHistory pattern; implicit assumption not documented in code.

All other aspects of the implementation are correct:
- boll->BB alias resolution in getDefaultIndicatorParams is correct.
- stoch-rsi direct key in DEFAULT_INDICATOR_PARAMS works correctly.
- Plan B only applies at CLI layer; MCP raw-data path is unchanged.
- Test fixtures for cmdMarketFilter correctly updated to array shape.
- --json path in cmdMarketFilter correctly sends raw (full array) instead of unwrapped data.
- No security issues found.
- No race conditions found.
- Error handling gaps: none introduced.
</details>
