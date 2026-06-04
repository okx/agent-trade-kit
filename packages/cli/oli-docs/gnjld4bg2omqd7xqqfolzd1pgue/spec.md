# Spec: 修复 `market filter` / `market indicator` CLI 空输出问题

> Source PRD (TECH_DESIGN): https://okg-block.sg.larksuite.com/docx/GnJld4bG2oMQd7xqqfolzD1pgue
> docs-path: `packages/cli/oli-docs/gnjld4bg2omqd7xqqfolzd1pgue`
> Repo: `okx-trade-mcp` (pnpm monorepo: `packages/core`, `packages/mcp`, `packages/cli`)
> Type: Bug-fix technical design (CLI render / param-assembly layer). **No Web/GUI front-end. No Figma / Lark design artifacts. No i18n key system** — see §8.

---

## 1. Goal + Success Criteria

### Goal
Fix two CLI commands in `okx-trade-cli` that produce empty / silent output despite the underlying online API returning valid data:

- **Bug 1** — `okx market filter <...>` (without `--json`) prints `Total: 0` / `No results` even when the API returns rows.
- **Bug 2** — `okx market indicator ema BTC-USDT --bar 1H` (without `--params`) prints **nothing at all** (silent failure).

### Success Criteria (acceptance, from PRD §验证计划 + knowledge-context Verification Checklist)
1. `pnpm build && pnpm typecheck` — no errors.
2. `pnpm test:unit` — all green (node:test runner, **not** Jest/Vitest), including the new/updated cases in §7.3.
3. Manual regression:
   - `okx market filter SPOT --limit 5` → renders a non-empty table; `... --json` output is **byte-for-byte unchanged** vs. current behavior.
   - `okx market indicator ema BTC-USDT --bar 1H` → produces **visible output**: with Plan B, the CLI applies the default period and renders values; if a default is genuinely unavailable, the Plan A hint message is printed. Never silent.
   - `okx market indicator ema BTC-USDT --bar 1H --params 2` → still renders values correctly (explicit `--params` wins over the default; no regression).
4. `--json` path of `market filter` continues to print `getData(result)` unchanged (backward compatible).
5. All MANDATORY cross-file sync obligations satisfied (see §9): `skills/okx-cex-market/SKILL.md` output docs, `eval/probes/market/` (filter re-confirmed + new indicator probe), bilingual CHANGELOG behavior-change note (Plan B + corrected tool description).

---

## 2. Scope Boundaries

> **Decision (confirmed):** Both **Plan A** (visible hint) and **Plan B** (default-param table) are in scope. Plan B's default table lives in `packages/core` (single source of truth) but is **applied CLI-render-only** — the MCP raw-data path is NOT changed. See §5.3 / §7.2.

### In scope
- `packages/cli/src/commands/market.ts` — `cmdMarketFilter` array-unwrap fix (Bug 1) + indicator render-loop visible-output fix (Bug 2 Plan A) + apply the core default-param table when `--params` is omitted (Bug 2 Plan B, CLI layer).
- `packages/cli/test/market.test.ts` — fix the detached object-shaped fixture to the real array shape; add new render assertions; add the Plan B default-param routing test.
- `packages/core/src/tools/indicator.ts` — add the exported default-param table for period-based indicators (single source of truth) + correct the misleading tool description string (line 212) so it no longer claims "Omit to use server defaults".
- `eval/probes/market/` — re-confirm `tier2-market-filter.live.test.ts`; add a new `tier2-market-get-indicator.live.test.ts` (Plan B changes tool behavior → CI `eval-probe-check` requires it).
- Bilingual CHANGELOG behavior-change annotation (Plan B) + `skills/okx-cex-market/SKILL.md` output-doc sync.
- Cross-file sync obligations triggered by visible-output change (§9).

### Out of scope (hard exclusions)
- **MCP raw-data output is NOT changed.** `market_filter` / `market_get_indicator` raw `data` returned to the LLM stays identical. The Plan B default-param table is applied **only at the CLI command layer** (before the tool call); the core tool's param-assembly (`indicator.ts:244`) and therefore the MCP path are untouched — see §5.3 / §7.2.
- No new CLI flags. No new MCP tools.
- `--json` output structure of `market filter` is unchanged.
- Site resolution / `RestClient` is untouched (multi-site behavior preserved — see §9).
- Other `aigc/mcp` commands beyond `market filter` are not refactored here (the same fixture-vs-wire-shape risk for them is flagged in §11 as a follow-up, not fixed in this scope).

---

## 3. Users + Eligibility / Permissions

- **End users:** CLI power users invoking `okx market ...` directly in a terminal, and AI agents that shell out to the CLI.
- **No auth / permission gating:** all `market` commands are read-only public market data and require **no API credentials** (confirmed in `skills/okx-cex-market/SKILL.md`). No KYC, no role gating.
- No PII / sensitive data is involved.

---

## 4. Entry Points + Navigation

CLI subcommands (no UI navigation):

| Command | Entry handler | File:line |
|---|---|---|
| `okx market filter <...>` | `cmdMarketFilter` | `packages/cli/src/commands/market.ts:375` |
| `okx market indicator <indicator> <instId> [...]` | indicator render handler (render loop) | `packages/cli/src/commands/market.ts:270`–`318` |

Reference (already-correct) implementation for the array-unwrap pattern: `cmdMarketOiHistory` (`market.ts:451`, unwrap at line 469).

---

## 5. Architecture

### 5.1 Data flow + layering
```
CLI invocation (okx market ...)
  → ToolRunner.run("market_filter" | "market_get_indicator", flatParams)   [packages/cli]
  → MCP/core tool handler assembles body → online aigc/mcp endpoint        [packages/core]
  → getData(result) unwraps the envelope                                    [packages/cli/formatter? — see below]
  → CLI render layer (market.ts) formats: printTable / printKv / outputLine
```
The bug sits entirely in the **CLI render / param-assembly layer**. `getData`, `outputLine`, `printJson`, `printTable`, `printKv` are existing shared formatter helpers in `packages/cli/src/formatter.ts` (lines 63, 93, 104, 125) — **reuse them; do not add new formatter primitives.**

### 5.2 Reference / reused modules (reuse, do not reinvent)
- **Reuse `packages/cli/src/formatter.ts`** — `outputLine` (the visible-message primitive for both fixes), `printTable`, `printKv`, `printJson`, `getData`.
- **Reuse the array-unwrap pattern from `cmdMarketOiHistory` verbatim** (`market.ts:469`): `(Array.isArray(raw) ? raw[0] : raw)`. This is the canonical `aigc/mcp`-family unwrap; Bug 1's fix must match it exactly.
- **Reuse `resolveIndicatorCode` / `KNOWN_INDICATORS` / `VALID_INDICATOR_NAMES`** (`packages/core/src/tools/indicator.ts:145, 46, 143`). The Plan B default-param table must be keyed off these existing structures and exported from `packages/core` — **single source of truth** (repo `CLAUDE.md`: shared business logic lives in `packages/core`) — while being applied at the CLI layer (§5.3).

### 5.3 Dependency impact analysis
- **Changed module:** `packages/cli/src/commands/market.ts`
  - **Upstream deps:** `formatter.ts` helpers (no signature changes needed — existing types satisfy the fix), `ToolRunner` type (unchanged).
  - **Downstream consumers:** the CLI argv router that wires `okx market filter` / `okx market indicator` to these handlers (handler signatures unchanged → no consumer changes). The only externally-visible change is **stdout output content** — which couples to the sync obligations in §9.
- **Changed module (Plan B):** `packages/core/src/tools/indicator.ts`
  - **Upstream:** none new.
  - **Downstream consumers:** `packages/mcp` (MCP tool) and `packages/cli` both call `market_get_indicator`. **Critical coupling resolved (confirmed decision):** the default-param table is added to `packages/core` as an **exported constant** (single source of truth), but it is **applied only at the CLI command layer**. The exact insertion point is the `cmdMarketIndicator` call site `market.ts:270–278`: today line 274 already drops empty params (`params: params && params.length > 0 ? params : undefined`) before `run("market_get_indicator", ...)`. Plan B replaces that empty fallback with a lookup into the core default-param table (i.e. when the user omits `--params`, substitute the indicator's default `paramList`). The core tool's own param-assembly (`indicator.ts:244`) is **NOT** changed, so the **MCP raw-data contract returned to the LLM is byte-identical** (honors the MANDATORY "MCP behavior unchanged" rule — §7.2). The misleading description string at `indicator.ts:212` is corrected (it no longer claims "Omit to use server defaults", which is false for the MCP path).

### 5.4 Module granularity
Keep both fixes inside the existing `cmdMarketFilter` / indicator render handler — no new files (the change is small and local). Do not inflate cognitive complexity beyond 15 (SonarQube gate); the indicator render-loop fix is a post-loop "did anything print?" guard, which is a single additional branch.

---

## 6. Primary Flow (Happy Path)

### Bug 1 — `okx market filter SPOT --limit 5` (non-`--json`)
1. CLI calls `market_filter`; online `aigc/mcp/market-filter` returns `{ code: "0", data: [ { rows: [...], total: 3 } ] }` — **`data` is an array**, result object at `data[0]`.
2. `getData(result)` returns the array.
3. **Fixed render:** unwrap `const payload = (Array.isArray(raw) ? raw[0] : raw)`, then `rows = payload?.["rows"] ?? []`, `total = payload?.["total"] ?? rows.length`.
4. Render `Total: <total>` + the rows table (existing `printTable` mapping, including the SWAP-only `fundingRate` column at `market.ts:442`).

### Bug 2 — `okx market indicator ema BTC-USDT --bar 1H` (no `--params`)
- **Plan A (mandatory):** the render loop still `continue`s on each empty timeframe; after the loop, if **nothing was printed**, print an explicit hint (see §8 copy). Result: visible, actionable output instead of silence. This is the universal safety net — it fires for any indicator/timeframe combination that still yields no values.
- **Plan B (confirmed, CLI-render-only):** for period-based indicators (ema/ma/wma/rsi/macd/bb/…), when `--params` is omitted the CLI looks up the default `paramList` from the core-exported default table (§5.3) at the `cmdMarketIndicator` call site (`market.ts:274`, replacing the current empty-param fallback) and sends it, so the server returns values; the existing render loop then prints them normally. Explicitly-supplied `--params` always wins. The MCP path is unchanged (defaults applied at CLI layer only — §5.3 / §7.2).

---

## 7. Data Dependencies + API Contracts

### 7.1 Endpoints (online, site-resolved via existing `RestClient` — do not hardcode any site URL)

| Tool | Endpoint | SSR | Notes |
|---|---|---|---|
| `market_filter` | `POST /api/v5/aigc/mcp/market-filter` | n/a (CLI) | `data` is an **array** `[{ rows, total }]`; result at `data[0]`. |
| `market_get_indicator` | `POST /api/v5/aigc/mcp/indicators` | n/a (CLI) | Period-based indicators with no `paramList` → `indicators.<CODE> = []`. |

### 7.2 Data models / contracts

**market-filter response** (verified against online API in PRD):
```jsonc
{ "code": "0", "data": [ { "rows": [ { "instId": "...", "rank": 1, "last": "...", "chg24hPct": "...", "volUsd24h": "...", "oiUsd": "...", "fundingRate": "...", "sortVal": "..." } ], "total": 3 } ] }
```
- `data` = `Array<{ rows: Array<Record<string, unknown>>, total: number }>`. **Result object is `data[0]`, NOT `data` itself** — this is the root cause of Bug 1.

**indicators response:**
```text
no paramList:    "indicators": { "EMA": [] }                                    ← empty array (server does NOT default)
paramList:[2]:   "indicators": { "EMA": [{ ts, values: { "2": "66870.1" } }] }  ← has values
```
- **Full envelope the render loop traverses** (verified `market.ts:280–300`): `getData(result)` → `outerArray` (`Array`), then `outerArray[0].data` (inner `Array`) → `[0].timeframes` (a map keyed by timeframe `tf`) → `timeframes[tf].indicators[<CODE>]`. I.e. `getData(result)[0].data[0].timeframes["1H"].indicators["EMA"]`. Fallbacks: `No data` when `outerArray` empty (`market.ts:284`); raw JSON dump when `timeframes` is absent (`market.ts:293`).
- `indicators.<CODE>` = `Array<{ ts: number, values: Record<string, string> }>`.
- **Contract truth (root cause Bug 2-①):** server does NOT apply default periods for period-based indicators. The tool description "Omit to use server defaults" (`indicator.ts:212`) is **factually wrong** for period indicators.

**MCP raw-data contract (stays unchanged — confirmed):** `market_filter` / `market_get_indicator` return the raw array/object to the LLM as today. The Plan B default-param table is applied **only at the CLI command layer**, so the core tool param-assembly (`indicator.ts:244`) and the MCP path are untouched. The misleading description at `indicator.ts:212` is corrected to stop claiming "Omit to use server defaults" (which is false for period indicators on the MCP path).

**Plan B default-param table (confirmed values; lives in `packages/core`, applied CLI-side):**

| Indicator | Default `paramList` | Source |
|---|---|---|
| EMA / MA / WMA / RSI | `[14]` | PRD example |
| MACD | `[12, 26, 9]` | PRD example |
| BB (Bollinger Bands) | `[20, 2]` | PRD example |
| Other period-based indicators in `KNOWN_INDICATORS` | to be confirmed in implementation against standard TA conventions | PRD Open Question #3 (examples only) |

> Confirmed scope: the PRD example defaults above are authoritative. For any remaining period-based indicator in `KNOWN_INDICATORS` (e.g. kdj/supertrend/…), the implementer fills in the conventional default period during implementation, keyed off the existing `KNOWN_INDICATORS` structure. Non-period indicators get no default entry (Plan A hint still covers them).

### 7.3 Test plan (data fixtures — node:test)
1. **Bug 1 fixture fidelity (MANDATORY):** change `packages/cli/test/market.test.ts` filter fixtures from object shape `fakeResult({ total, rows })` (lines 162, 169, 181, 193) to the **real array shape** `fakeResult([{ total, rows }])`. The current object-shaped mock is exactly why unit tests pass while the live CLI fails — fixing only the code without fixing the fixture leaves a meaningless green test.
2. **Bug 1 render test:** assert a non-empty filter response renders the table (`instId`, values) and correct `Total: N`.
3. **Bug 2 empty-result render test:** with `indicators.EMA = []`, assert stdout contains a **visible** message (Plan A hint text) — explicitly assert it is NOT silent (`out.join("")` non-empty, no error/exit-1).
4. **Plan B default-param routing test:** spy `ToolRunner`, assert the omitted-`--params` path sends the default `paramList` from the core table (e.g. EMA → `[14]`), and that an explicit `--params 2` overrides it. Route via named-flag / `v.xxx` convention, per repo CLI parameter-routing test rule; never positional `rest[N]`.

---

## 8. UI Spec + Copy / i18n

This is a **terminal CLI**. There is **no Web UI**, no component library (`@ok/okd` etc. not applicable), and **no i18n key system** in this repo — CLI output is hardcoded English plain text written via `outputLine` / `process.stdout.write` (verified: `market.ts` writes literal strings like `"No results"`, `"No data"`, `"No OI data"`; `formatter.ts:63`). **The `front-end-i18n-keychecker` workflow does not apply** — there are no translation keys to verify and no `i18n-config.json` for this CLI surface. New strings are added as literals matching the existing CLI tone.

### 8.1 Bug 1 output (non-`--json`)
- Header line: `Total: <total>` (existing format, `market.ts:429`).
- Table via existing `printTable` with columns: `rank`, `instId`, `last`, `chg24h%`, `volUsd24h`, `oiUsd`, (`fundingRate` only when `instType === "SWAP"`), `sortVal`. **No column/format change** — only the data now populates correctly.
- Empty-rows fallback `No results` (`market.ts:430`) stays — but now only fires when there genuinely are no rows.

### 8.2 Bug 2 output
- **Plan A hint copy (confirmed final wording, hardcoded English literal):**
  `No indicator values returned. This indicator may require a period — try --params (e.g. --params 14).`
  - Printed once after the render loop when nothing was emitted (e.g. a non-period indicator, or a period indicator with no default entry). Print via `outputLine` (consistent with sibling `No results` / `No data` messages).
- **Plan B output (confirmed):** when `--params` is omitted for a period-based indicator that has a default entry, the CLI sends the default `paramList` (§7.2 table) and renders the returned values via existing `printKv` (latest) / `printTable` (`--list`) — no new copy. The Plan A hint then only appears for the genuinely-empty residual case.

### 8.3 SKILL.md output-doc sync (MANDATORY — see §9)
The visible-output behavior of both commands changes → the output description in `skills/okx-cex-market/SKILL.md` must be reviewed/updated in the same MR. (Recorded lesson MR !207: a CLI output change shipped without SKILL.md update and was rejected.)

---

## 9. Rollout + Rollback / Safety

### Backward compatibility (repo `CLAUDE.md` MANDATORY)
- Bug 1: only the non-`--json` table render changes; `--json` output is structurally identical. No breaking change.
- Bug 2 Plan A: additive (new hint line only). No breaking change.
- Bug 2 Plan B (confirmed): **changes the meaning of "omit `--params`"** for the CLI (empty → default-period values) — a behavior enhancement that **MUST be annotated under `[Unreleased]` in BOTH `CHANGELOG.md` and `CHANGELOG.zh-CN.md`** (bilingual docs rule). Plan B also corrects the `indicator.ts:212` description string, which is a tool-description change → triggers the reviewer token-budget report obligation (`CLAUDE.md` Reviewer Checklist item 6) and the "modified tool → confirm probe still valid" obligation. (Note: the MCP raw-data behavior itself is unchanged — defaults are CLI-layer only — so this is a CLI-behavior + description-text change, not an MCP-contract change.)

### Multi-site (MANDATORY)
Fixes live in the render / param-assembly layer — site-agnostic (www / eea / us). **Do not hardcode any site URL.** Existing `RestClient` site resolution is untouched.

### MCP behavior unchanged (MANDATORY)
`market_filter` / `market_get_indicator` raw data to the LLM is identical. Do not touch the MCP server response path.

### CLI ↔ Skills sync (MANDATORY)
Output-format change → update `skills/okx-cex-market/SKILL.md` output docs in the same MR (lesson MR !207).

### Eval probe (MANDATORY)
- `eval/probes/market/tier2-market-filter.live.test.ts` **exists** — must re-confirm it still passes after the Bug 1 fix (trace-based assertion; not text-match).
- There is **no** `tier2-market-get-indicator` probe. Plan B changes tool behavior (CLI now sends default `paramList`), so a new `tier2-market-get-indicator.live.test.ts` probe **is required** by the CI `eval-probe-check` gate (confirmed decision). It should assert the agent invokes `okx market indicator` and that the omit-`--params` path now yields values.

### Rollback
Pure code fix in a single MR; revert the MR to roll back. No data migration, no feature flag, no stored state.

### Pre-MR gate (MANDATORY)
`pnpm build && pnpm typecheck` clean; `pnpm test:unit` green; bilingual CHANGELOG updated (Plan B behavior change + corrected tool description); `skills/okx-cex-market/SKILL.md` synced; `eval/probes/market/` filter probe re-confirmed + new indicator probe added; reviewer token-budget report attached (tool-description change).

---

## 10. Cross-References

- `packages/cli/src/commands/market.ts`
  - `cmdMarketFilter` lines 375–449 (bug at 425–428; fix at 425–428).
  - indicator render loop lines 297–318; `No data` fallback line 284; JSON-dump fallback line 292; `market_get_indicator` call lines 270–278.
  - reference impl `cmdMarketOiHistory` line 451 (unwrap at 469).
- `packages/cli/src/formatter.ts` — `outputLine`:63, `printJson`:93, `printTable`:104, `printKv`:125, `getData` (same file).
- `packages/core/src/tools/indicator.ts` — `paramList` assembly line 244; misleading description line 212; `resolveIndicatorCode`:145; `KNOWN_INDICATORS`:46; `VALID_INDICATOR_NAMES`:143.
- `packages/cli/test/market.test.ts` — filter fixtures lines 158–197 (object-shaped, must become array-shaped: 162, 169, 181, 193).
- `eval/probes/market/tier2-market-filter.live.test.ts` (exists); no indicator probe.
- `skills/okx-cex-market/SKILL.md` — output docs to sync; commands #14 (filter), #18 (indicator).
- `CHANGELOG.md` + `CHANGELOG.zh-CN.md` — Plan B behavior-change annotation.
- Repo `CLAUDE.md` — MANDATORY rules (multi-site, backward-compat, CLI↔Skills, eval-probe, bilingual docs, CLI parameter-routing tests, parity, MCP unchanged).

---

## 11. Open Questions (TBC)

> **All open questions were resolved with the user (2026-06-03). No TBC items remain.** Resolutions are baked into the spec sections above; recorded here for traceability.

- **TBC[1] — Bug 2 plan selection → RESOLVED:** implement **both Plan A and Plan B** (PRD "建议都做"). See §2, §6, §8.2.
- **TBC[2] — Plan B location & MCP-contract preservation → RESOLVED:** default-param table lives in `packages/core` (single source of truth) but is **applied CLI-render-only**; the MCP raw-data response to the LLM is unchanged, and the misleading `indicator.ts:212` description is corrected. See §5.3, §7.2.
- **TBC[3] — Plan A hint copy → RESOLVED:** use the PRD example string verbatim: `No indicator values returned. This indicator may require a period — try --params (e.g. --params 14).` See §8.2.
- **TBC[4] — Eval probe scope → RESOLVED:** re-confirm the existing `tier2-market-filter.live.test.ts`; **add** a new `tier2-market-get-indicator.live.test.ts` (Plan B changes tool behavior → required by CI `eval-probe-check`). See §9 Eval probe.
- **TBC[5] — Plan B default-param values → RESOLVED:** use the PRD example defaults (EMA/MA/WMA/RSI `[14]`, MACD `[12,26,9]`, BB `[20,2]`); remaining period-based indicators in `KNOWN_INDICATORS` confirmed during implementation against standard TA conventions. See §7.2 table.

### Follow-up (non-blocking, outside this scope)
- The same object-vs-array mock-fixture-vs-live-wire-shape drift may exist for other `aigc/mcp` CLI commands beyond `market filter`. Not fixed here; flagged for a separate hardening pass (no test currently guards fixture-vs-wire shape).

### Owner-attributed action items (from materials-review / PRD)
- (Author shaolong.wang / Eng) Plan selection **decided: Plan A + Plan B** (TBC[1]/[2]/[5] resolved — see §11).
- (Eng/Reviewer) Plan B corrects the `indicator.ts:212` tool description → attach the token-budget report per `CLAUDE.md` Reviewer Checklist item 6.
