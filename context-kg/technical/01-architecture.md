<!-- triggers: architecture, layer, rest-client, server, MCP, stdio, JSON-RPC, transport, buildTools, ToolSpec, module filter, readOnly, ListTools, CallTool, createToolRunner -->
# System Architecture

## Five-Layer Stack

```
┌─────────────────────────────────────────┐
│  MCP Host (Claude, agent-hub, etc.)     │  ← JSON-RPC 2.0 over stdio
├─────────────────────────────────────────┤
│  Entry Point (packages/mcp/src/index)   │  ← process stdin/stdout
├─────────────────────────────────────────┤
│  MCP Server (createServer)              │  ← ListTools / CallTool handlers
├─────────────────────────────────────────┤
│  Tool Registry (packages/core/tools/)   │  ← ToolSpec definitions, module filter
├─────────────────────────────────────────┤
│  REST Client (packages/core/client/)    │  ← HMAC signing, rate limiting
├─────────────────────────────────────────┤
│  OKX API (api.okx.com / regional)      │  ← HTTP/REST
└─────────────────────────────────────────┘
```

## MCP Server (`packages/mcp/`)

The MCP server (`packages/mcp/src/index.ts`) handles two JSON-RPC methods:

- **`tools/list`**: returns filtered ToolSpec array (filtered by `modules` config and `readOnly` flag)
- **`tools/call`**: dispatches to the matching tool handler, wraps result/error in MCP response format

Server bootstrap flow:
1. Load config (TOML + env vars) via `packages/core/src/config.ts`
2. Build REST client with credentials and site base URL
3. Collect all tools from `packages/core/src/tools/index.ts`
4. Apply module filter: remove tools whose module ID is not in the configured `modules` list
5. Apply readOnly filter: if `readOnly: true`, remove all tools where `isWrite: true`
6. Register filtered tools in the MCP SDK's `Server` instance

## ToolSpec Interface

Each tool is defined as a `ToolSpec` object in `packages/core/src/tools/types.ts`:

```typescript
interface ToolSpec {
  name: string;          // e.g. "spot_place_order"
  description: string;   // Intent-oriented description for the model
  inputSchema: JsonSchema; // JSON Schema for parameter validation (MCP SDK format)
  isWrite: boolean;       // true = funds/state modification
  module: ModuleId;       // e.g. "spot", "earn.savings"
  handler: (args: ToolArgs, context: ToolContext) => Promise<unknown>;
}
```

The `handler` function receives:
- `args`: validated parameter object (typed as `Record<string, unknown>`)
- `context`: `{ client: RestClient, config: OkxConfig }` — authenticated REST client plus full resolved config

## CLI Architecture (`packages/cli/`)

The CLI (`packages/cli/src/index.ts`) uses a `ToolRunner` abstraction that mirrors the MCP tool call interface. Key components:

- **`packages/cli/src/parser.ts`**: parses argv into `{ command, subcommand, flags, rest }`
- **`packages/cli/src/commands/*.ts`**: one file per module — maps subcommand strings to tool calls
- **`packages/cli/src/formatter.ts`**: formats tool results as tables or JSON (controlled by `--json` flag)
- **`createToolRunner(config)`**: factory that returns a runner wrapping the core tool handlers

The CLI does NOT call OKX API directly — it calls the same tool handlers as the MCP server.

## Test Structure

- `packages/core/test/` — unit tests for individual tool handler logic (15 files)
- `packages/cli/test/` — CLI parameter routing and integration tests (30 files)
- `packages/mcp/test/` — MCP server-level tests (2 files: bundle + server)

Test command: `pnpm test:unit` (runs node:test across all packages).

## Build Pipeline

- `tsup` builds each package from `src/index.ts` to `dist/`
- `packages/core` → imported by both mcp and cli
- Output format: ESM only
- Type declarations generated alongside JS output

Build command: `pnpm build` (runs tsup in all packages in dependency order).
