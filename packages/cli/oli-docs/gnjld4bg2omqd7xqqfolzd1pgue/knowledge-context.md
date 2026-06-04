# knowledge-context.md

> Knowledge context for: **修复 `market filter` / `market indicator` CLI 空输出问题** (Bug-fix TECH_DESIGN)
> Sources queried: `knowledge/` → **does not exist**; `context-kg/business/` + `context-kg/technical/` + `context-kg/quality/` → **exist (PRD-extracted KB, single-repo flat layout, no INDEX.md funnel — matched by frontmatter `triggers` comments)**.
> All rules below are PRD-extracted business knowledge (no human-compiled `knowledge/` base exists in this repo). There are therefore **no `[[backlink]]` networks and no human-vs-PRD conflicts to resolve**; the repo `CLAUDE.md` "MANDATORY" rules are the highest-authority constraints.

## How the spec-writer should consume this

1. This is a **two-bug CLI rendering / param-assembly fix**, not a feature. The spec must scope strictly to the CLI formatting layer (`packages/cli`) plus an **optional** `packages/core` indicator default-param change. Do **not** change MCP tool raw-data output.
2. Treat every **[Rule]** below as a hard constraint the spec must encode. Treat **[Pitfall]** as a regression trap that the spec's test plan must cover.
3. Run the **Verification Checklist** items as the spec's acceptance criteria.
4. Pay special attention to the **Cross-File Compound Risks** — they describe coupling (CLI↔Skills↔eval-probe↔CHANGELOG) that is invisible when reading any single source file and is exactly where this repo's recorded lessons recur.

---

## Constraint Checklist (must be encoded in spec.md)

### Array-unwrapping correctness (Bug 1)
- **[Rule]** `aigc/mcp` family endpoints return `data` as an **array** `[{...}]`; the result object is at `data[0]`. The fix must unwrap with `(Array.isArray(raw) ? raw[0] : raw)` — the exact pattern already used by the reference impl `cmdMarketOiHistory` (`packages/cli/src/commands/market.ts:469`). Verified in code: `cmdMarketFilter` (lines 425–428) is missing this unwrap; `cmdMarketOiHistory` (line 469) has it.
- **[Rule]** Backward compat: the `--json` path must keep printing `getData(result)` unchanged (no structural change to JSON output). Only the non-`--json` table render is fixed.

### Silent-empty-output correctness (Bug 2)
- **[Rule]** Server does **not** apply default periods for period-based indicators (EMA/MA/RSI/…). Omitting `paramList` returns `indicators.EMA = []` (empty array), not a defaulted value — confirmed at `packages/core/src/tools/indicator.ts:244` (`paramList: params && params.length > 0 ? params : undefined`). The tool-description text "Omit to use server defaults" (`indicator.ts:212`) is **factually wrong for period indicators**.
- **[Rule]** The render loop (`market.ts:297–318`) `continue`s on every empty timeframe, and the upstream `No data` (line 284) and JSON-dump fallback (line 292) both fail to fire when `outerArray` and `timeframes` are non-empty — net result is zero output. The spec must guarantee **some visible output** for the empty case (Plan A: explicit hint message; Plan B: default param table in `core` shared by CLI+MCP).
- **[Rule]** If Plan B (default param table) is chosen, the default table must live in **`packages/core`** (single source of truth) so CLI and MCP stay identical — never duplicate in CLI. (Repo `CLAUDE.md`: "Shared business logic should live in `packages/core` — avoid duplicating logic between packages." This also resolves PRD Open Question #1.)

### Repo-mandatory constraints (from repo `CLAUDE.md`, highest authority)
- **[Rule] Backward compatibility (MANDATORY)**: Plan B changes the behavior of "omit params" (empty → default values) — this is a behavior enhancement and **must be annotated in both `CHANGELOG.md` and `CHANGELOG.zh-CN.md`** under `[Unreleased]`.
- **[Rule] Multi-site (MANDATORY)**: fixes are in render/param-assembly layer — site-agnostic (www/eea/us). Do **not** hardcode any site URL; the existing `RestClient` site resolution is untouched.
- **[Rule] CLI ↔ Skills sync (MANDATORY)**: any change to CLI **output format** must update the corresponding `SKILL.md` (here: `skills/okx-cex-market/SKILL.md`). Recorded lesson: MR !207 changed `--json` output but missed SKILL.md and was rejected. Bug-1/Bug-2 change visible CLI render output → SKILL.md output docs must be checked.
- **[Rule] Eval probe (MANDATORY)**: modifying tool render behavior requires confirming `eval/probes/market/` probes still valid. Verified on disk: `eval/probes/market/tier2-market-filter.live.test.ts` **exists** (must re-confirm valid after Bug-1 fix); there is **no** `tier2-market-indicator` / `tier2-market-get-indicator` probe — if any tool *behavior* (Plan B) changes, a probe may be required (CI `eval-probe-check` gate; resolves PRD Open Question #4 partially).
- **[Rule] Pre-MR gate**: `pnpm build && pnpm typecheck` clean; `pnpm test:unit` green (node:test runner, not Jest/Vitest); CHANGELOG (bilingual) updated.
- **[Rule] MCP behavior unchanged**: `market_filter` / `market_get_indicator` raw `data` returned to the LLM stays identical (the LLM already parses the array fine). This fix is CLI-render-only (+ optional core default param). Do not touch the MCP server response path.

### Test-fixture fidelity
- **[Pitfall]** `packages/cli/test/market.test.ts:159–177` builds the filter fixture as an **object** `fakeResult({ total, rows })`, not the real array shape `fakeResult([{ total, rows }])`. This is *why* unit tests pass while the live CLI fails — the mock shape is detached from the live wire shape. The fix MUST update this fixture to the array shape, otherwise the green test is meaningless. Verified in code at the cited lines.
- **[Rule]** New/updated tests required: (1) filter array-shape render test; (2) indicator empty-result render test asserting a **visible** message (not silent); (3) if Plan B, a default-param routing test.

---

## PRD-Specific Analysis

### Knowledge–PRD Connections (every loaded file)
- **business/03-market-and-account.md** — Defines the exact two modules under fix (`market_filter` screener and the indicator module computing EMA/MA/RSI/BB/MACD), confirming indicators are period-based — directly underpins Bug 2's "period required" root cause.
- **business/01-overview.md** — Establishes the 3-package monorepo and the "MCP-first / CLI parity / shared-logic-in-core" principles that gate where the Plan-B default table must live.
- **business/05-skills-ecosystem.md** — Source of the CLI↔Skills output-format sync rule; the market fix must check `skills/okx-cex-market/SKILL.md` output docs.
- **business/11-cli-power-user-flags.md** — Confirms the CLI-only flag layer pattern; relevant only to scope-bound the fix (no new flags needed for Plan A; Plan B adds no agent-facing flag).
- **technical/01-architecture.md** — Documents the CLI render layering (`commands/*.ts` → `formatter.ts`), the `ToolRunner` abstraction the tests spy on, and `getData` usage — the precise layer the bug sits in.
- **technical/04-multisite-and-compatibility.md** — Backs the "site-agnostic, no hardcoded URL" constraint the fix must honor.
- **technical/03-error-and-ratelimit.md** — Background on how CLI surfaces errors; relevant to ensure the new "empty result" hint is plain output, not an error/exit-1 path.
- **quality/01-placeholder.md** — Source of the CLI parameter-routing spy-test pattern, the drift test, the bilingual-CHANGELOG pre-MR gate, and SonarQube cognitive-complexity ≤15 — all of which the fix's tests/refactor must satisfy.
- **repo `/CLAUDE.md`** (org-level project rules) — Highest-authority MANDATORY rules (multi-site, backward-compat, CLI↔Skills, eval-probe, bilingual docs); these override anything PRD-implied.

### Cross-File Compound Risks (coupling invisible per-file)
1. **CLI render change → 3 downstream sync obligations fire at once.** Changing the market CLI output couples to: (a) `skills/okx-cex-market/SKILL.md` output docs (05-skills + CLAUDE.md), (b) `eval/probes/market/` probe validity (CLAUDE.md), and (c) bilingual CHANGELOG for Plan B (04-multisite/CLAUDE.md). A spec that only patches `market.ts` + its unit test will pass `pnpm test:unit` but **fail review** on the missed sync obligations — this is the exact failure mode of recorded lessons MR !207 and MR !215.
2. **Plan B location coupling.** The "single source of truth in core" rule (01-overview) + MCP-behavior-unchanged rule (PRD) jointly constrain Plan B: defaults may be applied so CLI shows values, but the MCP tool's raw response to the LLM must not silently change shape — meaning a core default table must be applied in a way that does not alter the documented MCP raw-data contract, or must be CLI-render-only. The spec must explicitly state which, or it creates a CLI/MCP divergence the parity rule forbids.
3. **Fixture-vs-wire drift is structural, not local.** 03-market + the quality drift-test philosophy show this repo already has a `drift.test.ts` guarding registry alignment — but **no test guards mock-fixture-vs-live-wire-shape**. Fixing only `market.test.ts:170` patches one instance; the spec should flag that the same object-vs-array mock detachment can exist for other `aigc/mcp` commands.

### Lesson Recurrence Risk
- **Lesson: MR !207 (CLI output format changed, SKILL.md not updated → rejected).** **High recurrence risk.** This PRD changes visible CLI output for both `market filter` and `market indicator`. If the spec omits a "update `skills/okx-cex-market/SKILL.md` output section" task, it reproduces !207 exactly.
- **Lesson: #78 (positional `rest[0]` used instead of named flag → `--instId` silently broken 11 days).** **Low-moderate risk.** Bug 2 Plan B may touch param assembly; if it adds a default-params path it must route via the named-flag/`v.xxx` convention with a spy routing test, per the quality KB pattern.
- **Lesson: MR !215 (token-budget report omitted in MCP review).** **Low risk.** This fix adds no new MCP tool and no description change *unless* Plan B edits the `indicator.ts:212` description string — if it does, the reviewer token-budget obligation (CLAUDE.md Reviewer Checklist item 6) is triggered. Spec should note: if the misleading "Omit to use server defaults" description is corrected, that is a description change.
- **Lesson: fixture-vs-live-shape detachment (this very bug).** **Certain to recur** if the test fixture is not corrected to the array shape — the PRD itself documents this as the reason the bug shipped. Spec's test plan must explicitly mandate the array-shaped fixture.

---

## Coverage / Gaps
- **`knowledge/` base absent** — no human-compiled cross-module constraints or verification-scenario library exists; all guidance above is PRD-extracted + repo-`CLAUDE.md` policy. Spec-writer should not expect richer pitfall annotations than these.
- **No INDEX.md / _PAGE_INDEX.md funnel** in `context-kg/business/` — files matched directly via frontmatter `triggers`. Coverage is the full set of market/CLI/quality/multisite/error files; earn/bot/dca/smartmoney/event docs were correctly excluded as out of scope.
- **Minor KB drift (informational, not blocking):** `business/05-skills-ecosystem.md` says "Six Skill Packs" while `business/01-overview.md` and repo `CLAUDE.md` list 10/6 differently — irrelevant to this bug but the spec should target only `skills/okx-cex-market/SKILL.md`.

## Key file references (relative to repo-root)
- Bug 1 site: `packages/cli/src/commands/market.ts` — `cmdMarketFilter` lines 425–428 (buggy); reference impl `cmdMarketOiHistory` line 469.
- Bug 2 render site: same file, indicator render loop lines 297–318; `No data` fallback line 284; JSON-dump fallback line 292.
- Bug 2 param-assembly + misleading description: `packages/core/src/tools/indicator.ts` — line 244 (`paramList` omission), line 212 (wrong "server defaults" description).
- Test fixture to fix: `packages/cli/test/market.test.ts` — lines 159–177 (object-shaped `fakeResult`, must become array-shaped).
- Eval probes: `eval/probes/market/` — has `tier2-market-filter.live.test.ts`; **no indicator probe present**.
- Skills doc to sync: `skills/okx-cex-market/SKILL.md`.
