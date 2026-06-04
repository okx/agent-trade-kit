# Spec Review Report

## Overall: ISSUES_FOUND

Scope note: No Figma URL was provided and no `api-doc.md` / `design-artifacts/` exist for this requirement — this is a terminal CLI bug-fix with no Web/GUI surface (§8 confirms). Design-alignment (2.3) and API-doc-alignment (2.4) checks are therefore N/A; §7 was instead cross-checked directly against the source code on disk. Coverage (all 11 topics), PRD completeness, and internal consistency were fully reviewed. The spec is substantively accurate, covers every PRD requirement, resolves all 4 PRD open questions, and encodes every repo `CLAUDE.md` MANDATORY constraint. The issues below are one genuine implementation gap (MEDIUM) plus line-anchor drift against the actual source (LOW). No HIGH blockers.

## MEDIUM — Significant Gaps (should fix; affect correctness)

| # | Section | Issue | Source |
|---|---------|-------|--------|
| M1 | §5.3 / §7.2 / §6 Bug 2 Plan B | The spec attributes the indicator param-omission solely to `packages/core/src/tools/indicator.ts:244` and says Plan B is "applied at the CLI command layer (`market.ts`, before the tool call)" but never identifies *where*. In reality the CLI indicator handler itself already drops empty params at `market.ts:273` — `params: params && params.length > 0 ? params : undefined` — right before `run("market_get_indicator", ...)`. That line 273 call site is the actual insertion point for Plan B's CLI-side default lookup. The implementer needs this anchor; without it the spec implies the only param-drop is in core, which is incorrect. | source: `market.ts:270–278` (handler call site, esp. line 273) vs spec §5.3/§7.2 |
| M2 | §7.2 / §6 Bug 2 | The indicators data-model snippet in §7.2 jumps straight to `indicators.<CODE> = Array<{ts, values}>`, omitting the real outer envelope: `getData(result)` → `outerArray[0].data[0].timeframes[tf].indicators[CODE]` (an extra `data[0]` inner-array layer and a `timeframes` map). §6/§10 describe the `No data` (line 284) and JSON-dump (line 290) fallbacks correctly, but the §7.2 contract under-describes the nesting the render loop traverses. A reader relying on §7.2 alone could mis-model the response. | source: `market.ts:280–296` vs spec §7.2 indicators block |

## LOW — Minor Issues (nice to fix; do not block implementation)

| # | Section | Issue | Source |
|---|---------|-------|--------|
| L1 | §5.2 / §5.3 / §7.2 / §9 / §10 / §11 | The misleading tool-description string "Omit to use server defaults" is at `indicator.ts:211` (inside the `params` block spanning lines 209–212), not line **212** as cited repeatedly. The string itself and the claim about it are accurate. | source: `indicator.ts:209–212` |
| L2 | §7.3 / §10 | Filter-fixture line anchors are off. Spec cites object-shaped `fakeResult({...})` at "lines 162, 169, 181, 193" and the block at "158–197"; actual `fakeResult({...})` calls are at lines 161, 167, 179, 191 and the `describe` block runs 158–199. The fixtures-to-fix are correctly identified; only the line numbers drift. | source: `packages/cli/test/market.test.ts:158–199` |
| L3 | §10 | "`cmdMarketFilter` ... bug at 425–428; fix at 425–428" — the buggy parse actually starts at line **424** (`const data = getData(result) as Record<string, unknown> | null`). Off by one. | source: `market.ts:424–428` |

## Recommendation

Address M1 before implementation: explicitly name `market.ts:273` (the `cmdMarketIndicator` call site) as the CLI-layer insertion point for the Plan B default-param lookup, since the existing empty-param drop lives there — not only in core `indicator.ts:244`. M2 is worth a one-line clarification of the full `outerArray[0].data[0].timeframes` nesting in §7.2. The LOW line-anchor drifts (L1–L3) are cosmetic; the referenced files and code constructs are all correct and exist on disk. Overall the spec is implementation-ready once M1 is clarified.
