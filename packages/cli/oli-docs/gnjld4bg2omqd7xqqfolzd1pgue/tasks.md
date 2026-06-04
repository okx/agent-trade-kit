# Tasks: 修复 `market filter` / `market indicator` CLI 空输出问题

> Source spec: `packages/cli/oli-docs/gnjld4bg2omqd7xqqfolzd1pgue/spec.md`
> Repo: `okx-trade-mcp` (pnpm monorepo: `packages/core`, `packages/mcp`, `packages/cli`)
> Test runner: **node:test** (NOT Jest/Vitest). Build: tsup. Validation: zod.
> Type: terminal CLI bug-fix — **no Web/GUI, no Figma, no i18n key system** (spec §8). Figma load step: N/A (no Figma URL provided; folder absent by design).

---

## Overview

### Goal
Fix two `okx-trade-cli` commands that render empty/silent output despite the online API returning valid data:
- **Bug 1** — `okx market filter <...>` (non-`--json`) prints `Total: 0` / `No results` even when rows exist. Root cause: `data` from `market_filter` is an **array** `[{rows,total}]`, but `cmdMarketFilter` parses it as a plain object → `rows`/`total` are `undefined`.
- **Bug 2** — `okx market indicator ema BTC-USDT --bar 1H` (no `--params`) prints **nothing** (silent). Root causes: ① server does NOT apply default periods for period-based indicators → `indicators.EMA = []`; ② render loop `continue`s on every empty timeframe with no post-loop guard → total silence.

### Solution shape (confirmed scope, spec §2 / §5.3 / §7.2)
- **Bug 1**: unwrap `data[0]` using the canonical pattern from `cmdMarketOiHistory` (`market.ts:469`). `--json` output stays byte-for-byte unchanged.
- **Bug 2 Plan A (mandatory safety net)**: post-loop "did anything print?" guard → emit a visible hint. Fires for any indicator/timeframe that still yields no values.
- **Bug 2 Plan B (CLI-render-only)**: a default-param table is added to `packages/core` as the **single source of truth** (exported const), but **applied only at the CLI call site** (`market.ts:274`). When `--params` is omitted for a period-based indicator, the CLI substitutes the default `paramList`. Explicit `--params` always wins. **The MCP raw-data contract to the LLM is unchanged** — `indicator.ts:244` core param-assembly is NOT touched.

### Non-goals (hard exclusions, spec §2)
- MCP raw-data output unchanged (`market_filter` / `market_get_indicator` to the LLM byte-identical).
- No new CLI flags, no new MCP tools.
- `--json` structure of `market filter` unchanged.
- `RestClient` / site-resolution untouched (multi-site preserved — do NOT hardcode site URLs).
- Other `aigc/mcp` CLI commands not refactored (follow-up only, spec §11).

### TBC summary
**NONE.** Spec §11: *"All open questions were resolved with the user (2026-06-03). No TBC items remain."*
- TBC[1] Plan selection → **RESOLVED: Plan A + Plan B**.
- TBC[2] Plan B location → **RESOLVED: core SSoT, applied CLI-side; MCP unchanged**.
- TBC[3] Plan A hint copy → **RESOLVED: verbatim string (see T3)**.
- TBC[4] Eval probe scope → **RESOLVED: re-confirm filter probe + add indicator probe**.
- TBC[5] Plan B default values → **RESOLVED: PRD examples authoritative; remaining period indicators filled with conventional TA defaults during impl (T1)**.

Because no unresolved TBC items remain, **no task is `TBC-BLOCKED`** and there is no TBC-checkpoint task. T1 carries an inline `// resolved per TBC[5]` note for the "fill conventional defaults" directive.

---

## File Impact List

| Path | Action | Reason |
|------|--------|--------|
| `packages/core/src/tools/indicator.ts` | MODIFY | Add exported `DEFAULT_INDICATOR_PARAMS` table (SSoT); correct misleading `params` description string at line 212 (no longer claims "Omit to use server defaults"). |
| `packages/core/test/indicator.test.ts` | MODIFY/CREATE | Unit test asserting the default-param table exports expected values (EMA/MA/WMA/RSI `[14]`, MACD `[12,26,9]`, BB `[20,2]`) and is keyed off `KNOWN_INDICATORS`. |
| `packages/cli/src/commands/market.ts` | MODIFY | Bug 1 array-unwrap in `cmdMarketFilter` (line 424–428); Bug 2 Plan A post-loop hint (after loop 297–318); Bug 2 Plan B default-param lookup at call site (line 274). |
| `packages/cli/test/market.test.ts` | MODIFY | Fix object→array filter fixtures (lines 161,167,179,191); add Bug 1 render test, Bug 2 empty-result test, Plan B routing test. |
| `eval/probes/market/tier2-market-filter.live.test.ts` | RE-CONFIRM | Existing probe must still pass after Bug 1 fix (trace-based). |
| `eval/probes/market/tier2-market-get-indicator.live.test.ts` | CREATE | New probe required by CI `eval-probe-check` (Plan B changes CLI tool behavior). |
| `CHANGELOG.md` | MODIFY | `[Unreleased]` bilingual note: Plan B behavior change + corrected tool description. |
| `CHANGELOG.zh-CN.md` | MODIFY | Chinese mirror of the CHANGELOG note (bilingual docs rule). |
| `skills/okx-cex-market/SKILL.md` | MODIFY | Output-doc sync for commands #14 (filter) & #18 (indicator) (lesson MR !207). |

---

## Execution Plan

```
Wave 1 (parallel): T1, T2          ← no dependencies; different files (core vs cli)
Wave 2 (sequential): T3            ← depends on T1 (imports core table) + T2 (same market.ts/market.test.ts)
Wave 3 (parallel): T4, T5, T6      ← depend on code complete; different files (probes / changelog / skill)
Wave 4 (sequential): T7            ← final pre-MR gate; depends on all
```

**Wave-conflict scan (per skill rules):**
- Wave 1: T1 touches `packages/core/**`; T2 touches `packages/cli/**`. No shared file; T2 does NOT import the new core table (Bug 1 is filter-only). ✅ parallel-safe.
- Wave 2: T3 shares `market.ts` + `market.test.ts` with T2 → must be a **later wave** (sequential), and imports the table from T1 → depends on T1. ✅
- Wave 3: T4 (`eval/probes/market/**`), T5 (`CHANGELOG*.md`), T6 (`skills/okx-cex-market/SKILL.md`) — disjoint file sets. ✅ parallel-safe.
- Wave 4: T7 runs gates only (no source edits) → no conflict.

---

## Task T1 — Core default-param table + corrected tool description (SSoT)

| Field | Content |
|-------|---------|
| **Task ID** | T1 |
| **Wave** | Wave 1 |
| **Depends On** | (none) |
| **Status** | DONE |
| **Intent** | Add the period-based-indicator default-param table as an **exported constant** in `packages/core` (single source of truth per repo `CLAUDE.md`), and correct the factually-wrong `params` description string. The MCP param-assembly (`indicator.ts:244`) is **NOT** changed — this task only adds an export and edits a doc string. |

**Spec Context** (spec §5.2, §5.3, §7.2 default-param table, §9, §11 TBC[5]):
- Existing structures to key off (do NOT reinvent): `KNOWN_INDICATORS` (`indicator.ts:46`), `VALID_INDICATOR_NAMES` (`indicator.ts:143`), `resolveIndicatorCode` (`indicator.ts:145`), `INDICATOR_CODE_OVERRIDES` (`indicator.ts` top).
- **Confirmed default `paramList` values (authoritative, PRD examples):**

  | Indicator | Default `paramList` |
  |---|---|
  | EMA / MA / WMA / RSI | `[14]` |
  | MACD | `[12, 26, 9]` |
  | BB (Bollinger Bands; alias `boll`) | `[20, 2]` |
  | Other period-based indicators in `KNOWN_INDICATORS` (e.g. kdj/supertrend/dema/tema/cci/…) | conventional TA default period — `// resolved per TBC[5]`: implementer fills standard conventions; non-period indicators (e.g. obv, vwap, sar, ad) get **no** entry. |

- The table must be **exported** (e.g. `export const DEFAULT_INDICATOR_PARAMS: Record<string, number[]>`) keyed by indicator name (lowercase, matching `KNOWN_INDICATORS[].name`) so the CLI (T3) can import it. Provide a small exported helper if convenient (e.g. `getDefaultIndicatorParams(name: string): number[] | undefined`) that lowercases + resolves aliases via the same logic — keep cognitive complexity ≤15.
- **Description correction (root cause Bug 2-①, spec §7.2 / §9 / review L1):** the `params` field description at `indicator.ts:212` currently ends with `"...RSI [14] (period). Omit to use server defaults."` — the **"Omit to use server defaults"** claim is false for period indicators (server returns `indicators.<CODE> = []`). Reword so it no longer promises server defaults (e.g. `"...RSI [14] (period). For period-based indicators a parameter is required; the CLI applies a sensible default when omitted."` or simply drop the false sentence). This is a **tool-description change** → triggers reviewer token-budget report obligation in T7.
- **MUST NOT change** `indicator.ts:244` (`paramList: params && params.length > 0 ? params : undefined`) — keeping it preserves the MCP raw-data contract (spec §7.2 / §9 MANDATORY "MCP behavior unchanged").

**Test Scenarios:**
- `DEFAULT_INDICATOR_PARAMS["ema"]` → `[14]`; `["ma"]`/`["wma"]`/`["rsi"]` → `[14]`.
- `DEFAULT_INDICATOR_PARAMS["macd"]` → `[12,26,9]`; `["bb"]` → `[20,2]`; alias `["boll"]` resolves to `[20,2]` (or via helper).
- Helper (if added): `getDefaultIndicatorParams("EMA")` (uppercase) → `[14]`; `getDefaultIndicatorParams("obv")` (non-period) → `undefined`.
- Every key present in the table is a member of `KNOWN_INDICATORS` names / overrides (no typos).

**Files:** MODIFY `packages/core/src/tools/indicator.ts`; MODIFY/CREATE `packages/core/test/indicator.test.ts`.

**Steps:**
1. Add failing test in `packages/core/test/indicator.test.ts` asserting `DEFAULT_INDICATOR_PARAMS` (and helper, if added) returns the values above and resolves the `boll`→`bb` alias.
2. RED: run the core test → fails (symbol not exported).
3. Add the exported `DEFAULT_INDICATOR_PARAMS` const (+ optional helper) keyed off `KNOWN_INDICATORS`; fill PRD-authoritative values + conventional defaults for remaining period indicators; leave non-period indicators absent.
4. Correct the `params` description string at `indicator.ts:212` (remove the false "Omit to use server defaults").
5. GREEN: core test passes; `pnpm --filter @agent-tradekit/core typecheck` clean.
6. Refactor: ensure no duplicate literals; keep complexity ≤15.

**Commands:**
- RED: `pnpm --filter @agent-tradekit/core build && node_modules/.bin/tsx --test packages/core/test/indicator.test.ts`
- GREEN: same test green + `pnpm --filter @agent-tradekit/core typecheck`

**DoD:** Table exported & imported-ready; description string no longer claims server defaults; `indicator.ts:244` untouched; core unit tests green; typecheck clean.

---

## Task T2 — Bug 1: `cmdMarketFilter` array-unwrap + fixture fidelity + render test

| Field | Content |
|-------|---------|
| **Task ID** | T2 |
| **Wave** | Wave 1 |
| **Depends On** | (none) |
| **Status** | DONE |
| **Intent** | Fix `cmdMarketFilter` to unwrap the `data[0]` array shape so the non-`--json` table renders; fix the object-shaped test fixtures (which masked the bug); add render assertions. `--json` path stays byte-for-byte unchanged. |

**Spec Context** (spec §4, §5.2, §6 Bug 1, §7.2, §8.1, §10; review L2/L3):
- **Endpoint contract**: `market_filter` → `POST /api/v5/aigc/mcp/market-filter` returns `{ "code":"0", "data": [ { "rows":[{instId,rank,last,chg24hPct,volUsd24h,oiUsd,fundingRate,sortVal}], "total":3 } ] }`. **`data` is an `Array<{rows,total}>`; the result object is `data[0]`, NOT `data` itself** — this is the root cause.
- **Current buggy code** (`market.ts:424–430`):
  ```ts
  const data = getData(result) as Record<string, unknown> | null;   // line 425 — treats array as object
  if (opts.json) return printJson(data);                            // line 426
  const rows  = (data?.["rows"]  ?? []) as Record<string, unknown>[];  // undefined → []
  const total = data?.["total"] ?? rows.length;                        // undefined → 0
  outputLine(`Total: ${total}`);                                    // prints "Total: 0"
  if (!rows.length) { outputLine("No results"); return; }           // bails → empty
  ```
- **Canonical fix pattern (reuse verbatim from `cmdMarketOiHistory`, `market.ts:469`):** `const entry = (Array.isArray(raw) ? raw[0] : raw)`. Apply it in `cmdMarketFilter`:
  ```ts
  const raw = getData(result);
  if (opts.json) return printJson(raw);     // ← MUST print getData(result) unchanged (spec §1 SC4, §9)
  const data = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
  const rows  = (data?.["rows"]  ?? []) as Record<string, unknown>[];
  const total = data?.["total"] ?? rows.length;
  ```
  **Critical**: the `--json` branch must serialize the original `getData(result)` value (the full array), so `... --json` output is byte-for-byte unchanged (spec Success Criteria #4). Do the unwrap **after** the json check.
- **Table render unchanged** (`market.ts:432–447`): columns `rank, instId, last, chg24h%, volUsd24h, oiUsd, (fundingRate only when instType==="SWAP"), sortVal` via existing `printTable`. Reuse `outputLine`/`printTable` from `formatter.ts` — **do not add new formatter primitives**.
- **Empty/edge state**: `No results` fallback (`market.ts:430`) stays but now only fires when rows genuinely empty.
- **Fixture fidelity (MANDATORY, spec §7.3.1, review L2):** filter fixtures in `packages/cli/test/market.test.ts` currently use object shape `fakeResult({ total, rows })` at lines **161, 167, 179, 191** (block ~158–199). They MUST become the real array shape `fakeResult([{ total, rows }])`. The object-shaped mock is exactly why unit tests passed while the live CLI failed — fixing only code without the fixture leaves a meaningless green test.

**Test Scenarios** (spec §7.3.1–2):
- Non-empty filter response (array shape `[{total:3, rows:[…]}]`) → stdout contains `Total: 3` and the row table (`instId`, values visible).
- SWAP `instType` → `fundingRate` column appears; non-SWAP → it does not.
- `--json` with the array fixture → `printJson` receives the **full array** (`getData(result)`) unchanged (assert structure identical to current).
- Empty rows (`[{total:0, rows:[]}]`) → `Total: 0` + `No results` (genuine empty only).

**Files:** MODIFY `packages/cli/src/commands/market.ts` (`cmdMarketFilter` 424–448); MODIFY `packages/cli/test/market.test.ts` (fixtures 161/167/179/191; new render assertions).

**Steps:**
1. Update the filter fixtures to array shape `fakeResult([{ total, rows }])`; add the non-empty render assertion + `--json`-unchanged assertion. RED.
2. RED: run filter tests → fail (current object-parse yields `Total: 0`).
3. Apply the array-unwrap fix (unwrap after the json check; json prints raw `getData(result)`).
4. GREEN: filter tests pass.
5. Refactor: confirm pattern matches `cmdMarketOiHistory:469`; no duplicate literals.

**Commands:**
- RED: `pnpm --filter @okx_ai/okx-trade-cli build && node_modules/.bin/tsx --test packages/cli/test/market.test.ts`
- GREEN: same test green + `pnpm --filter @okx_ai/okx-trade-cli typecheck`

**DoD:** Non-empty filter renders table + correct `Total`; `--json` byte-for-byte unchanged; fixtures are array-shaped; filter unit tests green; typecheck clean.

---

## Task T3 — Bug 2: Plan A visible-hint guard + Plan B CLI-side default-param lookup

| Field | Content |
|-------|---------|
| **Task ID** | T3 |
| **Wave** | Wave 2 |
| **Depends On** | T1 (imports `DEFAULT_INDICATOR_PARAMS` from core), T2 (shares `market.ts` & `market.test.ts`) |
| **Status** | DONE |
| **Intent** | Make `okx market indicator` never silent. Plan A: post-loop guard emits a hint when nothing printed. Plan B: when `--params` omitted for a period-based indicator, substitute the core default `paramList` at the CLI call site so the server returns values. MCP path unchanged. |

**Spec Context** (spec §6 Bug 2, §7.2, §8.2, §5.3, review M1/M2):
- **Handler call site** `cmdMarketIndicator` (`market.ts:266–278`):
  ```ts
  const params = opts.params
    ? opts.params.split(",").map((p) => Number(p.trim())).filter((n) => !Number.isNaN(n))
    : undefined;
  const result = await run("market_get_indicator", {
    instId, indicator, bar: opts.bar,
    params: params && params.length > 0 ? params : undefined,   // line 274 ← Plan B insertion point (review M1)
    returnList: opts.list ?? false, limit: opts.limit, backtestTime: opts.backtestTime,
  });
  ```
  **Plan B**: replace line 274's empty-fallback with a default lookup. When the user omitted `--params` (`params` is empty/undefined), look up `DEFAULT_INDICATOR_PARAMS` (imported from `packages/core`, T1) for the resolved indicator; if a default exists, send it; otherwise send `undefined` (Plan A then covers it). Explicit `--params` always wins. Example wiring:
  ```ts
  import { getDefaultIndicatorParams /* or DEFAULT_INDICATOR_PARAMS */ } from "@agent-tradekit/core/...";
  const explicit = params && params.length > 0 ? params : undefined;
  const effectiveParams = explicit ?? getDefaultIndicatorParams(indicator);  // undefined for non-period indicators
  // ...params: effectiveParams,
  ```
  **Do NOT** change `packages/core/src/tools/indicator.ts:244` — default substitution happens **only here at the CLI layer** → MCP raw-data contract to the LLM stays byte-identical (spec §7.2 / §9 MANDATORY).
- **Full response envelope the render loop traverses** (review M2, verified `market.ts:280–300`): `getData(result)` → `outerArray` → `outerArray[0]["data"]` (inner array) → `[0]["timeframes"]` (map keyed by timeframe `tf`) → `timeframes[tf]["indicators"][apiCode]` = `Array<{ts:number, values:Record<string,string>}>`. Existing fallbacks: `No data` when `outerArray` empty (`market.ts:284`); raw-JSON dump when `timeframes` absent (`market.ts:292–294`). `apiCode = resolveIndicatorCode(indicator)`.
- **Render loop** (`market.ts:297–318`): for each `[tf, tfData]`, `if (!values?.length) continue;` then prints header + `printTable` (when `opts.list`) or `printKv` (latest). **Bug**: every timeframe empty → loop emits nothing → silence.
- **Plan A (mandatory safety net, spec §8.2):** track whether anything printed inside the loop (e.g. `let printed = false;` set `true` before the header write). After the loop, `if (!printed) outputLine("...")` with the **confirmed verbatim copy** (TBC[3], hardcoded English literal, no i18n):
  > `No indicator values returned. This indicator may require a period — try --params (e.g. --params 14).`
  Print via `outputLine` (consistent with sibling `No results` / `No data`). This fires for non-period indicators or period indicators with no default entry.
- **Plan B output (spec §8.2):** when default applied, the server returns values and the existing loop renders them via `printKv` (latest) / `printTable` (`--list`) — **no new copy, no column changes**.
- **Complexity guard (spec §5.4):** Plan A is a single post-loop branch; Plan B is a single lookup at the call site. Keep cognitive complexity ≤15.
- Reuse `outputLine`/`printKv`/`printTable` from `formatter.ts` — no new primitives.

**Test Scenarios** (spec §7.3.3–4; repo CLI param-routing rule):
- **Plan A**: `indicators.<CODE> = []` (empty), no default applied → stdout is **non-empty** and contains the exact hint string; explicitly assert NOT silent (`out.join("")` non-empty, no throw/exit-1).
- **Plan B routing**: spy `ToolRunner`; call indicator handler with `--params` omitted for EMA → assert the call receives `params: [14]` (default from core table). Assert routing via **named flag / `v.xxx`**, never positional `rest[N]` (repo rule, issue #78).
- **Explicit override**: `--params 2` → call receives `params: [2]` (explicit wins; no regression).
- **Non-period indicator** (e.g. `obv`) with no default + empty result → Plan A hint prints (no default substituted).
- **Plan B render**: when default yields values, loop renders `printKv`/`printTable` normally (no hint printed).

**Files:** MODIFY `packages/cli/src/commands/market.ts` (`cmdMarketIndicator` 266–319: line 274 Plan B, post-loop Plan A); MODIFY `packages/cli/test/market.test.ts` (Plan A empty test, Plan B routing test, explicit-override test).

**Steps:**
1. Add failing tests: Plan A empty-result hint (assert non-silent + exact copy); Plan B routing (omit `--params` → `[14]`); explicit `--params 2` override. RED.
2. RED: run indicator tests → fail (currently silent / no default sent).
3. Import the core default table/helper (T1); wire Plan B at line 274 (`explicit ?? getDefaultIndicatorParams(indicator)`). Add Plan A `printed` flag + post-loop `outputLine(hint)`.
4. GREEN: indicator tests pass.
5. Refactor: complexity ≤15; confirm `indicator.ts:244` untouched (grep to verify MCP path unchanged).

**Commands:**
- RED: `pnpm --filter @okx_ai/okx-trade-cli build && node_modules/.bin/tsx --test packages/cli/test/market.test.ts`
- GREEN: same test green + `pnpm --filter @okx_ai/okx-trade-cli typecheck`

**DoD:** Indicator command never silent; Plan A hint exact; Plan B sends default `paramList` on omit and explicit wins; MCP core path (`indicator.ts:244`) unchanged; indicator unit tests green; typecheck clean.

---

## Task T4 — Eval probes: re-confirm filter probe + add indicator probe

| Field | Content |
|-------|---------|
| **Task ID** | T4 |
| **Wave** | Wave 3 |
| **Depends On** | T2 (Bug 1 fix), T3 (Plan B behavior) |
| **Status** | DONE |
| **Intent** | Satisfy the MANDATORY eval-probe obligation. Re-confirm the existing filter probe still passes (trace-based) after Bug 1; add the required new indicator probe because Plan B changes CLI tool behavior (CI `eval-probe-check` gate). |

**Spec Context** (spec §9 Eval probe, §7.3, repo `CLAUDE.md` LLM Eval Probe section, TBC[4]):
- Existing `eval/probes/market/tier2-market-filter.live.test.ts` **must be re-confirmed** (trace-based assertion via `findToolCall(trace, { commandPatterns })`; NOT reply-text match — upstream 401/auth is not an LLM signal).
- **New** `eval/probes/market/tier2-market-get-indicator.live.test.ts` is **required** (no such probe exists; Plan B changes behavior). Naming: `tier2-<tool_name>.live.test.ts`, snake_case matching tool name.
- Fixed import (Vite alias inside idea-agent eval runner, regardless of depth): `import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';`
- Assertion: agent invokes `okx market indicator` (resolves to `market_get_indicator`); the omit-`--params` path now yields values (Plan B). Use trace-based `findToolCall` to verify the `okx market indicator` tool + key params; do not text-match the reply.
- See `eval/README.md` for the probe-writing guide; mirror the structure of the existing filter probe.

**Test Scenarios:**
- Filter probe: agent shells `okx market filter ...` → trace shows the tool call (re-confirm green).
- Indicator probe: agent shells `okx market indicator ema ...` without explicit params → trace shows the `okx market indicator` invocation (Plan B default path exercised).

**Files:** RE-CONFIRM `eval/probes/market/tier2-market-filter.live.test.ts`; CREATE `eval/probes/market/tier2-market-get-indicator.live.test.ts`.

**Steps:**
1. Read existing filter probe + `eval/README.md` to mirror structure/import.
2. Run the filter probe (or static-confirm it compiles & trace assertion still valid) → re-confirm.
3. Author the new indicator probe with the fixed `@eval/shared` import + trace-based `findToolCall` for `okx market indicator`.
4. Ensure it compiles under the repo's tsx/typecheck (live execution runs in idea-agent container; locally verify it type-checks and the CI `eval-probe-check` static gate is satisfied).

**Commands:**
- Compile/typecheck check: `pnpm --filter @okx_ai/okx-trade-cli typecheck` (and confirm probe file presence satisfies `eval-probe-check`).
- (Live eval triggered separately on idea-agent dashboard — out of local scope.)

**DoD:** Filter probe re-confirmed; new indicator probe present, correctly imported, trace-based, and passes the `eval-probe-check` static gate.

---

## Task T5 — Bilingual CHANGELOG behavior-change annotation

| Field | Content |
|-------|---------|
| **Task ID** | T5 |
| **Wave** | Wave 3 |
| **Depends On** | T1 (description correction), T3 (Plan B behavior) |
| **Status** | DONE |
| **Intent** | Record the user-facing behavior change under `[Unreleased]` in BOTH CHANGELOGs (bilingual docs rule), covering Plan B (omit `--params` now applies a default period) and the corrected tool description. |

**Spec Context** (spec §9 Backward compatibility, §1 SC5, repo `CLAUDE.md` Documentation + Pre-MR Checklist):
- Plan B **changes the meaning of "omit `--params`"** for the CLI (empty → default-period values) — a behavior enhancement that MUST be annotated under `[Unreleased]`.
- Also note the corrected `indicator.ts:212` tool-description string.
- Bilingual: `CHANGELOG.md` (English) + `CHANGELOG.zh-CN.md` (中文), Keep-a-Changelog format. Add `Fixed`/`Changed` entries:
  - Fixed: `okx market filter` non-`--json` empty-output (array-unwrap).
  - Fixed: `okx market indicator` silent failure → now prints a hint (Plan A).
  - Changed: `okx market indicator` applies a default period when `--params` omitted (Plan B, CLI-layer; MCP unchanged); corrected `market_get_indicator` params description.

**Test Scenarios:** N/A (docs). Manual check: both files contain matching `[Unreleased]` entries; bilingual parity.

**Files:** MODIFY `CHANGELOG.md`, `CHANGELOG.zh-CN.md`.

**Steps:**
1. Add `[Unreleased]` Fixed/Changed entries to `CHANGELOG.md`.
2. Mirror identical entries (translated) in `CHANGELOG.zh-CN.md`.
3. Verify Keep-a-Changelog format + language-switch header intact.

**Commands:** GREEN: visual/manual review (no test); ensure no markdown lint break.

**DoD:** Both CHANGELOGs updated with parallel bilingual entries covering Plan B + description correction under `[Unreleased]`.

---

## Task T6 — SKILL.md output-doc sync

| Field | Content |
|-------|---------|
| **Task ID** | T6 |
| **Wave** | Wave 3 |
| **Depends On** | T2 (filter output), T3 (indicator output) |
| **Status** | DONE |
| **Intent** | Sync the output documentation in `skills/okx-cex-market/SKILL.md` because both commands' visible output changed (MANDATORY CLI↔Skills sync; lesson MR !207 rejected a CLI output change shipped without SKILL.md update). |

**Spec Context** (spec §8.3, §9 CLI↔Skills sync, §10; repo `CLAUDE.md` CLI ↔ Skills Sync):
- Commands affected: **#14 `filter`** (now renders a populated table + correct `Total: N`) and **#18 `indicator`** (now visible — Plan B default-period values, or the Plan A hint instead of silence).
- Update the **output description / examples** in `skills/okx-cex-market/SKILL.md` for these two commands to reflect the new non-`--json` output. `--json` for filter is unchanged → no change there.
- No CLI flags changed (no parameter-doc change), only output behavior.

**Test Scenarios:** N/A (docs). Manual check: SKILL.md command #14 & #18 output sections match actual new behavior.

**Files:** MODIFY `skills/okx-cex-market/SKILL.md`.

**Steps:**
1. Locate command #14 (filter) and #18 (indicator) output docs in `SKILL.md`.
2. Update filter output to show a populated table example + `Total: N`.
3. Update indicator output to reflect Plan B default-period rendering and the Plan A hint for the genuinely-empty case.
4. Leave `--json` filter docs unchanged.

**Commands:** GREEN: manual review against T2/T3 actual output.

**DoD:** SKILL.md #14 & #18 output docs reflect the new behavior; no stale "empty/silent" descriptions remain.

---

## Task T7 — Pre-MR gate verification + reviewer token-budget report

| Field | Content |
|-------|---------|
| **Task ID** | T7 |
| **Wave** | Wave 4 |
| **Depends On** | T1, T2, T3, T4, T5, T6 |
| **Status** | DONE |
| **Intent** | Run the full MANDATORY pre-MR gate and assemble the reviewer token-budget report required because a tool description changed. No source edits — gate + report only. |

**Spec Context** (spec §9 Pre-MR gate, §1 Success Criteria; repo `CLAUDE.md` Pre-MR Checklist + Reviewer Checklist item 6):
- Pre-MR gate: `pnpm build && pnpm typecheck` clean; `pnpm test:unit` green (includes the new §7.3 cases).
- Manual regression (spec §1.3): `okx market filter SPOT --limit 5` → non-empty table; `... --json` byte-for-byte unchanged; `okx market indicator ema BTC-USDT --bar 1H` → visible output (Plan B values or Plan A hint, never silent); `... --params 2` → explicit value renders (no regression).
- **Reviewer token-budget report (MANDATORY — `CLAUDE.md` Reviewer Checklist item 6):** because the `market_get_indicator` `params` description string changed (a tool-description change), the MR comment must include the module-level + global token budget table (before/after tool count + token estimate, confirm ≤25,000). Tool **count is unchanged** (no tool added/removed) — only a description string edited; the report documents the negligible delta. Lesson: MR !215 first review missed the token report.
- Confirm MCP↔CLI parity preserved (no new MCP tool, no new CLI flag → parity intact); multi-site untouched (no hardcoded site URL).

**Test Scenarios:**
- `pnpm build` → success; `pnpm typecheck` → 0 errors.
- `pnpm test:unit` → all green (core + cli + mcp suites).
- Manual regression commands above produce expected visible output.

**Files:** none (gate run). Output: pass/fail summary + token-budget report text (for the MR comment).

**Steps:**
1. `pnpm build` (or `npm run build`).
2. `pnpm typecheck`.
3. `pnpm test:unit`.
4. Run the four manual regression commands; confirm outputs.
5. Assemble the token-budget report (module `market` + global; before/after; confirm ≤25,000) for the MR comment.

**Commands:**
- `pnpm build && pnpm typecheck && pnpm test:unit`

**DoD:** Build + typecheck + unit tests all green; manual regression confirms visible output + `--json` unchanged; token-budget report assembled; parity & multi-site confirmed untouched.

---

## Verification matrix (maps to spec §1 Success Criteria)

| Success Criterion (spec §1) | Covered by |
|---|---|
| 1. `pnpm build && pnpm typecheck` clean | T7 (per-task typecheck in T1–T3) |
| 2. `pnpm test:unit` green (incl. §7.3 cases) | T1, T2, T3, T7 |
| 3a. `market filter SPOT --limit 5` non-empty table | T2, T7 |
| 3b. filter `--json` byte-for-byte unchanged | T2, T7 |
| 3c. `market indicator ema ... --bar 1H` visible (Plan B/Plan A, never silent) | T3, T7 |
| 3d. `... --params 2` renders (explicit wins) | T3, T7 |
| 4. filter `--json` prints `getData(result)` unchanged | T2 |
| 5. cross-file sync (SKILL.md, eval probes, bilingual CHANGELOG) | T4, T5, T6 |
| MCP raw-data unchanged (MANDATORY) | T1 (244 untouched), T3 (CLI-layer only) |
| Multi-site / no hardcoded URL (MANDATORY) | T7 confirm (no change to RestClient) |
| Reviewer token-budget report (tool-desc change) | T7 |
