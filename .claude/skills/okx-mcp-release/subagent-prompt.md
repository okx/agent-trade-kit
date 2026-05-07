# Subagent Scan Prompts

This file holds the prompt templates the orchestrator (`SKILL.md`) injects into each
scanning subagent. There are two templates: one for CLI scanning, one for Local MCP
scanning. They share an output schema.

The orchestrator substitutes `{{MODULE_ID}}`, `{{RUN_ID}}`, and `{{REPO_ROOT}}` before
dispatching.

---

## Output schema (both templates)

Each subagent writes a single JSON file matching this structure:

```json
{
  "module": "<module-id>",
  "tools": [
    {
      "name": "spot_place_order",
      "description": "...",
      "params": {
        "instId": { "type": "string", "required": true, "description": "..." }
      },
      "isWrite": true
    }
  ]
}
```

`params` rules:
- `type`: one of `string`, `number`, `integer`, `boolean`, `array`, `object`
- `required`: bool
- include `enum`, `description`, `default` if present in the source zod schema
- nested objects flattened into dot.path keys when the runtime serializer would (matches
  how MCP `tools/list` exposes them); when in doubt, copy the shape produced by zod's
  `.describe()` output

`isWrite`:
- `true` if the tool mutates funds / opens / closes / transfers / cancels / amends
- `false` for queries

---

## Template A — CLI scan

````
You are scanning the OKX trade-kit CLI to extract the tool surface for module `{{MODULE_ID}}`.

**Inputs to read:**
1. `{{REPO_ROOT}}/packages/cli/src/cli-registry.ts` — find the entry for module `{{MODULE_ID}}`. List every command (and nested subgroup) and its `toolName`. Also collect any `alternateTools` referenced.
2. For every `toolName` (including alternates) collected above, read its ToolSpec definition under `{{REPO_ROOT}}/packages/core/src/tools/`. Files are organized by topic, not always by module name (e.g. `spot-trade.ts`, `algo-trade.ts`, `bot/grid.ts`). Use grep to find the `name: "<toolName>"` literal.
3. For each ToolSpec: record `name`, `description`, and walk its zod input schema to fill `params`.

**Output:**
Write the result to `{{REPO_ROOT}}/.tmp/okx-mcp-release/{{RUN_ID}}/cli/{{MODULE_ID}}.json`.

The JSON must match the schema above exactly. Sort tools by name ascending.

**Quality bar:**
- Do not invent fields. If a description is empty in source, leave it empty.
- If you cannot resolve a `toolName` (orphaned reference), include it in a `_unresolved` top-level array and continue with what you have.
- Stop and report if you cannot find the module entry in `cli-registry.ts` at all.

Return only the file path you wrote and a one-line summary (tool count). No prose.
````

---

## Template B — Local MCP scan

````
You are scanning the OKX trade-kit Local MCP server (stdio MCP) to extract the tool
surface for module `{{MODULE_ID}}`.

**Inputs to read:**
1. `{{REPO_ROOT}}/packages/mcp/src/index.ts` and `{{REPO_ROOT}}/packages/mcp/src/server.ts` — find every tool registered for module `{{MODULE_ID}}`. The MCP package may compose / fan-out / re-wrap tools; capture the **final** registered shape (the schema actually advertised to MCP clients).
2. Walk into helper files under `{{REPO_ROOT}}/packages/mcp/src/` and shared definitions under `{{REPO_ROOT}}/packages/core/src/tools/` as needed to resolve descriptions and zod schemas.

**Output:**
Write the result to `{{REPO_ROOT}}/.tmp/okx-mcp-release/{{RUN_ID}}/mcp/{{MODULE_ID}}.json`.

Same schema as the CLI scan. Sort tools by name ascending.

**Quality bar:**
- The "final registered shape" matters — if a tool is wrapped to add/remove a parameter
  vs the underlying ToolSpec in core, record the wrapped shape, not the inner spec.
- If a module has no tools registered in Local MCP (which is legitimate for some
  optional modules), output `{"module":"{{MODULE_ID}}","tools":[]}`.

Return only the file path you wrote and a one-line summary. No prose.
````
