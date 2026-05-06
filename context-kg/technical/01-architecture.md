<!-- triggers: architecture, layer, rest-client, server, MCP, stdio, JSON-RPC, transport, buildTools, ToolSpec, module filter, readOnly, ListTools, CallTool, createToolRunner, pilot, Pilot, okx-pilot, pilot-cache, PilotManager, PilotNode, list-tools -->
# System Architecture

## Two-Binary Architecture

CLI and MCP are independent binaries that share `@agent-tradekit/core`. See `ARCHITECTURE.md` Section 3 for the canonical diagram.

```
┌─────────────────────────────────────────┐  ┌─────────────────────────────────────────┐
│  MCP Host (Claude, agent-hub, etc.)     │  │  User Terminal                          │
│  JSON-RPC 2.0 over stdio                │  │                                         │
└────────────────────┬────────────────────┘  └──────────────────────┬──────────────────┘
                     │ stdio JSON-RPC                                │ terminal command
┌────────────────────▼────────────────────┐  ┌──────────────────────▼──────────────────┐
│  okx-trade-mcp  (binary)                │  │  okx  (binary)                          │
│  packages/mcp/src/index.ts              │  │  packages/cli/src/index.ts              │
│  → MCP Server → ListTools / CallTool    │  │  → parser → ToolRunner                  │
└────────────────────┬────────────────────┘  └──────────────────────┬──────────────────┘
                     │                                               │
                     └──────────────────────┬───────────────────────┘
                                            │
                      ┌─────────────────────▼─────────────────────┐
                      │    @agent-tradekit/core  (shared SDK)     │
                      │ config · tools · rest-client · signature  │
                      └─────────────────────┬─────────────────────┘
                                            │ HTTPS + HMAC-SHA256
                      ┌─────────────────────▼─────────────────────┐
                      │            OKX REST API v5                 │
                      │          https://www.okx.com               │
                      └─────────────────────────────────────────────┘
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

- `packages/core/test/` — unit tests for individual tool handler logic (26 files)
- `packages/cli/test/` — CLI parameter routing and integration tests (47 files), including bidirectional drift test (`drift.test.ts`) that verifies CLI registry ↔ ToolSpec alignment, context-kg accuracy test (`context-kg-accuracy.test.ts`) that verifies documentation numbers stay in sync with code, and skill description length test (`skill-description-length.test.ts`) that enforces the Codex 1024-char limit on SKILL.md frontmatter
- `packages/mcp/test/` — MCP server-level tests (2 files: bundle and server)

Test command: `pnpm test:unit` (runs node:test across all packages).

## Pilot Network Resilience Layer

A **Pilot proxy layer** sits between the REST client and the OKX API, providing transparent fallback for users in restricted network environments (DNS poisoning). See `context-kg/technical/05-pilot-proxy.md` for full details.

## Agent Self-Discovery (`okx list-tools`)

The CLI exposes `okx list-tools [--json]` for AI agent self-discovery. This command serializes the full CLI registry (all commands, parameters, tool names) into structured JSON, enabling agents to enumerate capabilities programmatically without parsing `--help` text. The registry is built from the same `CLI_REGISTRY` map that drives both help text generation and the MCP tool registry — ensuring agents always see an accurate, up-to-date tool list.

## Build Pipeline

- `tsup` builds each package from `src/index.ts` to `dist/`
- `packages/core` → imported by both mcp and cli
- Output format: ESM only
- Type declarations generated alongside JS output

Build command: `pnpm build` (runs tsup in all packages in dependency order).
