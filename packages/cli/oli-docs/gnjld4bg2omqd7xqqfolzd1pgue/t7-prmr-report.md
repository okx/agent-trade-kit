# T7 — Pre-MR Gate Result + Reviewer Token-Budget Report

> Paste the **Token-Budget Report** section below into the MR comment.
> Required by `CLAUDE.md` Reviewer Checklist item 6 because the
> `market_get_indicator` `params` description string changed (a tool-description
> change). Lesson: MR !215 first review missed the token report.

## 1. Pre-MR Gate Result (spec §9)

| Gate | Command | Result |
|------|---------|--------|
| Build | `pnpm build` | PASS — core / mcp / cli all built (tsup, 0 errors) |
| Typecheck | `pnpm typecheck` | PASS — 3 workspaces, 0 errors |
| Unit tests | `NODE_OPTIONS=--max-old-space-size=4096 pnpm test:unit` | PASS — core 1291 / cli 1593 / mcp 25, **0 fail** |

Notes:
- Unit gate was initially RED on one **stale** CLI test
  (`packages/cli/test/indicator.test.ts` "omits params when string is empty")
  that asserted the pre-Plan-B contract (`params === undefined` when
  `--params ""`). Plan B (spec §7.2 / §7.3 item 4) now substitutes the core
  default `paramList` (`rsi` → `[14]`) at the CLI layer, so that assertion was
  contradicted by the spec-mandated new behavior. The test assertion was
  updated to the Plan B contract (`params === [14]`). Test-file-only change; no
  source/impl edits.

## 2. Manual Regression (spec §1.3) — all visible, no silence

| # | Command | Expected | Observed |
|---|---------|----------|----------|
| 1 | `okx market filter --instType SPOT --limit 5` | non-empty table | PASS — `Total: 5`, 5 ranked rows (BTC-USDT … XAUT-USDT) |
| 2 | `okx market filter --instType SPOT --limit 5 --json` | raw array shape unchanged | PASS — JSON array of `{rows:[…]}`; MCP raw-data contract preserved |
| 3 | `okx market indicator ema BTC-USDT --bar 1H` (no `--params`) | visible output (Plan B value or Plan A hint, never silent) | PASS — Plan B applied default `[14]` → `14 → 64663.9` |
| 4 | `okx market indicator ema BTC-USDT --bar 1H --params 2` | explicit value renders, no regression | PASS — `2 → 63621.3` (explicit `--params` wins) |

> Note: spec wrote the filter command with a positional `SPOT`; the actual CLI
> contract takes `--instType SPOT` (named flag, per the CLI parameter-routing
> rule). Behavior verified with the real flag form.

## 3. Reviewer Token-Budget Report (MANDATORY)

**Change classification:** tool-**description** edit only on one existing tool
(`market_get_indicator`, `params` field). **No tool added or removed** — tool
counts are unchanged at every level. Per `docs/mcp-design-guideline.md` §4.2 the
token estimate is `chars / 4`; only the description string length changed.

### 3.1 Description string delta (the only change)

| | chars | ~tokens (`chars/4`) |
|---|------:|--------------------:|
| Before | 190 | ~47.5 |
| After | 263 | ~65.8 |
| **Delta** | **+73** | **+18.3** (negligible) |

Old: `… RSI [14] (period). Omit to use server defaults.`
New: `… RSI [14] (period). For period-based indicators a parameter is required; the CLI applies a sensible default when omitted.`

### 3.2 Module-level budget — `market`

| | tools | ~tokens | vs 25,000 |
|---|------:|--------:|-----------|
| Before | 20 | ~4,482 | OK |
| After | 20 | ~4,500 | OK |
| Delta | **±0 tools** | **+~18** | well within |

### 3.3 Global budget

The 25,000-token budget governs the **default-enabled** tool schema
(`DEFAULT_MODULES = spot, swap, option, account, bot.grid, skills`). `market` is
**not** a default-enabled module, so this description edit does **not** affect the
default-set total; it is shown for completeness.

| Scope | tools | ~tokens | vs 25,000 |
|-------|------:|--------:|-----------|
| Default-enabled set (before & after) | 68 | ~14,410 | **OK — ≤ 25,000** |
| All-modules registry (informational) | 163 | ~37,865→~37,883 | n/a (not the budgeted set; full registry, not default-enabled) |

Statistic command (`docs/mcp-design-guideline.md` §6 / Reviewer Checklist):

```
node -e "const{allToolSpecs}=require('./packages/core/dist/index.js');const t=allToolSpecs();let c=0;t.forEach(x=>c+=JSON.stringify({name:x.name,description:x.description,inputSchema:x.inputSchema}).length);console.log(t.length+' tools, ~'+Math.round(c/4)+' tokens')"
```

**Conclusion:** count unchanged (±0 tools), token delta ≈ +18 (description text
only). Budgeted default-enabled set ≈ 14,410 tokens — **confirmed ≤ 25,000**.
No budget action (compress / merge / CLI-downgrade) required.

## 4. Parity & Multi-Site (spec §9 / repo CLAUDE.md)

- **MCP ↔ CLI parity: intact.** No new MCP tool and no new CLI flag were added —
  Plan B is applied at the CLI command layer only; the MCP `market_get_indicator`
  raw-data contract is byte-identical (defaults are *not* sent on the MCP path).
- **Multi-site: untouched.** No hardcoded site URL introduced; base URL still
  flows through config (`OKX_SITES` / `baseUrl`).
