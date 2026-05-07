---
name: okx-mcp-release
description: 构建 CLI / Local MCP / Remote MCP 三方工具集对齐与 ai-mcp-server 发布闭环。当用户运行 `/okx_mcp_release pre` 或 `/okx_mcp_release prod`，或说"同步 mcp 到 pre/prod"、"发布 mcp 工具"时触发。
---

# okx-mcp-release Skill

Orchestrates a six-phase release pipeline that aligns the OKX trade-kit CLI, Local MCP,
and Remote MCP tool surfaces, then opens a draft MR on `ai-mcp-server` if Remote drifts.

**Trigger:** `/okx_mcp_release pre` or `/okx_mcp_release prod`. The slash command is a
thin shell that hands off here.

**Spec:** `docs/superpowers/specs/2026-05-07-okx-mcp-release-design.md`

---

## Inputs

- `$ARGUMENTS`: must contain `pre` or `prod`. If neither, ask the user before proceeding.
- env vars `MCP_PRE_URL` / `MCP_PROD_URL` for Remote endpoints.
- Sibling repo `../ai-mcp-server` checked out (used in Phase 5).

---

## Module list (canonical, 17 modules)

Read from `docs/module-registry.md` table — only rows with status `✅ approved`.
At time of writing: `market, futures, swap, option, spot, account, news, event,
earn.savings, smartmoney, bot.grid, bot.dca, earn.dcd, earn.onchain, skills,
earn.autoearn, earn.flash`.

Re-parse the table at runtime in case the list changes.

---

## Phase 0 — Prep

Steps:
1. Verify CWD is the okx-trade-mcp repo root (`pwd` ends in `/okx-trade-mcp`; `package.json` has `name: "okx-trade-kit"` workspace marker, or `git config remote.origin.url` matches).
2. `git fetch origin master`.
3. Compute `RUN_ID = $(date -u +%Y%m%dT%H%M%SZ)` and create `.tmp/okx-mcp-release/$RUN_ID/{cli,mcp}/`.
4. Capture `git rev-parse origin/master` into a variable for later snapshot metadata.
5. Parse the approved module list from `docs/module-registry.md` (use `grep -E '^\| [a-z][a-z0-9.]+ +\| ✅' docs/module-registry.md | awk '{print $2}'`).

If any step fails, abort with a clear error. Do not proceed.

---

## Phase 1 — CLI scan (17 parallel subagents)

For every approved module ID, dispatch one subagent with the **CLI scan template** from
`subagent-prompt.md`, substituting `{{MODULE_ID}}`, `{{RUN_ID}}`, `{{REPO_ROOT}}`.

Use `Agent` tool with `subagent_type: general-purpose`. **Send all 17 dispatches in a
single message** (parallel execution).

After all return:
- Verify each `.tmp/okx-mcp-release/$RUN_ID/cli/<module>.json` exists and parses as JSON.
- For any missing or invalid file: re-dispatch that single subagent **once**.
- Still failing → abort with stdout listing the failed modules.

---

## Phase 2 — Local MCP scan (17 parallel subagents)

Same as Phase 1 but uses **Local MCP scan template** and writes to
`.tmp/okx-mcp-release/$RUN_ID/mcp/<module>.json`.

Same retry-once-then-abort policy.

---

## Phase 3 — CLI ≡ Local strict compare

For each module:
1. Load `cli/<module>.json` and `mcp/<module>.json`.
2. Build a name-keyed dict from each tool list.
3. For every name in either side:
   - If only in CLI → diff entry `cli_only`.
   - If only in MCP → diff entry `mcp_only`.
   - If in both: deep-compare `description`, `params`, `isWrite`. Any mismatch → diff
     entry `mismatch` with the differing field names.

If any diff entries exist:
- Write `.tmp/okx-mcp-release/$RUN_ID/report-<RUN_ID>.md` with a `## Phase 3` section
  listing every mismatch (per-module table; show original values side-by-side).
- Print a stdout summary: count of cli_only / mcp_only / mismatches.
- **Abort.** Do not proceed to Phase 4.

If no diffs:
- Merge all 17 `cli/<module>.json` (CLI is the source of truth) into `docs/tools.json`
  with shape:
  ```json
  {
    "generatedAt": "<RUN_ID ISO8601>",
    "gitCommit": "<origin/master HEAD>",
    "modules": {
      "<module>": { "tools": [ { "name": "...", ..., "source": ["cli","mcp"] } ] }
    }
  }
  ```
- Each tool gets `source: ["cli","mcp"]` since both produced identical shape.
- Sort modules alphabetically by ID; sort tools within a module by name.
- Print "Phase 3 ✓ CLI ≡ Local across N modules / M tools".

---

## Phase 4 — Remote fetch + diff

Run:
```bash
python3 .claude/skills/okx-mcp-release/scripts/mcp_release.py diff docs/tools.json $ENV
```

The script handles retry-once internally and exits:
- `0` if no delta (Remote already matches Local). Print "Phase 4 ✓ Remote in sync, nothing to release", **exit pipeline**.
- `1` if delta exists. Capture stdout JSON delta into a variable.
- `2` if env var missing — print which one and abort.
- `4` if Remote unreachable after retry — abort.

If delta exists:
- Append `## Phase 4` section to `report-<RUN_ID>.md` with the JSON delta plus a human
  table (add / modify / remove counts and names).
- Stdout summary.
- Proceed to Phase 5.

---

## Phase 5 — ai-mcp-server auto develop + draft MR

⚠️ This phase modifies a sibling repo. Always work on a fresh branch off master, never
on master itself.

```bash
cd ../ai-mcp-server
git checkout master && git pull
BRANCH="feat/sync-tools-${ENV}-$(date +%Y%m%d)"
git checkout -B "$BRANCH"
```

Read `../ai-mcp-server/CLAUDE.md` and follow it strictly. For each delta entry:

**add (new tool):**
1. Classify `gateway` (pure HTTP proxy) vs `custom` (server-side logic) vs
   `pending_custom` (CLI-only — skip).
2. Update `docs/trading_oauth_tools.json` with the new entry.
3. If `gateway`:
   - Run `python3 scripts/gen_manual_sql.py`.
   - Create Flyway migration `V$(date +%Y.%m.%d.%H%M)__sync_<tool>.sql` with the
     INSERT/UPSERT for `mcp_tool_config` per region/env (the helper script generates
     the SQL files; the migration just sources them).
4. If `custom`: scaffold a `@McpTool` Java handler skeleton + a unit test file with
   `// TODO` markers; do not invent business logic.
5. Add `mcp_workspace_tool` migration (INSERT IGNORE).

**modify:** update `docs/trading_oauth_tools.json` and append an `ON DUPLICATE KEY
UPDATE` migration for the affected tools.

**remove:** add a migration that DELETEs the row from `mcp_tool_config` and
`mcp_workspace_tool` for that tool name.

After all delta entries processed:

```bash
mvn clean package -DskipTests
mvn test
```

If anything fails — stop, do **not** delete the branch, print failing step + log tail
to stdout, and ask the user to take over.

If all green:

```bash
git add -A
git commit -m "sync: align Remote MCP with okx-trade-mcp tools.json (RUN_ID=$RUN_ID)"
git push -u origin "$BRANCH"
```

Build the MR description by inserting the entire `report-<RUN_ID>.md` (Phase 3 + Phase
4 sections) plus a top "Auto-generated by /okx_mcp_release" notice:

```bash
glab mr create --draft \
  --title "sync: align Remote MCP with okx-trade-mcp ($ENV)" \
  --description "$(cat <path-to-report-md>)"
```

Print the resulting MR URL.

`cd -` back to okx-trade-mcp.

---

## Failure & retry policy summary

| Failure | Policy |
|--------|--------|
| Phase 1/2 single subagent | Retry once. Still fails → abort listing failed modules. |
| Phase 3 mismatch | Abort, write report. |
| Phase 4 Remote fetch | Retry once (in script). Still fails → abort. |
| Phase 4 delta exists | Proceed to Phase 5 with report. |
| Phase 5 mvn / git step | Stop in place, leave branch, ask user. |

---

## Cleanup

`.tmp/okx-mcp-release/$RUN_ID/` is **kept** after run for audit. `gitignore`d so it
won't pollute repo. Old runs older than 7 days may be pruned at the start of the next
run (best-effort: `find .tmp/okx-mcp-release -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +`).

---

## Out of scope (for now)

- Composite/fan-out whitelist: spec assumes strict 1:1 between CLI and Local MCP.
  If real divergence emerges, extend `tools.json` to support `mcpOnly`/`cliOnly`
  fields and update Phase 3 logic. Today: any divergence is a bug.
- Reverse sync (deleting tools from Remote that no longer exist in Local) is included
  via `delta.remove`, but the auto-generated DELETE migrations should be reviewed
  carefully on the draft MR — destructive ops.
