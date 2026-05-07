# ai-mcp-server Phase 5 Workflow Reference

This document is a **local digest** of `../ai-mcp-server/CLAUDE.md` covering only what
the `okx-mcp-release` skill needs in Phase 5. **The sibling repo's CLAUDE.md remains
authoritative.** When in doubt or when this digest disagrees with the source, follow
the source.

Source of truth: `../ai-mcp-server/CLAUDE.md`

---

## Tool Classification

Every tool maps to one of three types in `docs/trading_oauth_tools.json`:

| Type | Criteria |
|------|----------|
| `gateway` | Pure HTTP proxy to OKX API. Uses `mcp_tool_config` DB row + `HttpToolExecutor`. Default for read-only public-data tools. |
| `custom` | Requires server-side logic (composite call, filtering, auth assembly). Java `@McpTool` handler class needed. |
| `pending_custom` | CLI-only (local filesystem, session state). **Skip in Phase 5** — not applicable to server MCP. |

Defaulting heuristic for new tools (when uncertain):
- `isWrite=false` and matches a single OKX REST endpoint → `gateway`.
- `isWrite=true` or composes multiple OKX endpoints / does pre-filtering → `custom`.
- Tool name starts with `skills_` and reads local FS → `pending_custom`.

---

## Region × Env matrix (gateway tools only)

Every gateway tool needs **6** `mcp_tool_config` rows:

| Region | PROD URL prefix | PRE URL prefix |
|--------|-----------------|-----------------|
| HK | `https://www.okx.com` | `https://beta.okex.org` |
| US | `https://app.okx.com` | `https://usbeta.okex.org` |
| EU | `https://my.okx.com` | `https://eubeta.okex.org` |

PRE rows use the tool name with a `pre-` prefix (e.g. `pre-account_get_balance`).

URL must be **fully qualified** (`https://...`), not relative — `HttpToolExecutor`
calls `fromHttpUrl()` and rejects relative paths at runtime.

---

## simulator_header_enabled

| Value | When |
|-------|------|
| `1` | User-scoped data (account, positions, orders, fills, leverage, personal earn history). |
| `0` | Public data (market, news, smartmoney, skill catalog, product lists). |

When `1`, the tool's `input_schema` must include:

```json
"simulatedTrading": {
  "type": "boolean",
  "description": "Set true for simulated (demo) trading. Default: false (live)."
}
```

---

## Flyway migration rules

- Never modify a pushed migration. New change = new file.
- Naming: `V{YYYY}.{MM}.{DD}.{HHMM}__{description}.sql`
- `mcp_workspace_tool`: use `INSERT IGNORE` (idempotent).
- `mcp_tool_config`: use `ON DUPLICATE KEY UPDATE` (corrections re-runnable).

---

## Pre-MR checklist (apply before pushing)

- [ ] `docs/trading_oauth_tools.json` updated for every change.
- [ ] Flyway migration present for every DB change.
- [ ] `mcp_workspace_tool` rows added (INSERT IGNORE).
- [ ] `simulator_header_enabled` correct per the rule above.
- [ ] Gateway URLs are fully qualified.
- [ ] All 6 region×env SQL files generated for every new gateway tool (run `python3
      scripts/gen_manual_sql.py`).
- [ ] Unit tests for any new/modified custom handler (skeleton ok; mark `// TODO`).
- [ ] `mvn clean package -DskipTests` passes.
- [ ] `mvn test` passes.

---

## Skeleton scaffolds (use only when CLAUDE.md doesn't have a more recent template)

### Custom handler skeleton

```java
// Path: ai-tool-rest/src/main/java/.../tools/<Tool>Handler.java
@McpTool(name = "<tool_name>")
public class <Tool>Handler {
    // TODO: inject required services
    // TODO: implement business logic — see okx-trade-mcp packages/core/src/tools for the canonical behavior.
}
```

### Unit test skeleton

```java
// Path: ai-tool-rest/src/test/java/.../tools/<Tool>HandlerTest.java
class <Tool>HandlerTest {
    @Test
    void todo_implement() {
        // TODO: replicate okx-trade-mcp test cases for <tool_name>.
    }
}
```

The skeletons are intentionally minimal. The draft MR is the handoff point — the human
reviewer fills in business logic. Do not invent behavior.
