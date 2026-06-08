import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { OkxRestClient } from "../client/rest-client.js";
import type { OkxConfig } from "../config.js";
import type { ModuleId } from "../constants.js";

export type ToolArgs = Record<string, unknown>;

export type JsonSchema = Tool["inputSchema"];
export type OutputSchema = NonNullable<Tool["outputSchema"]>;

export interface ToolContext {
  config: OkxConfig;
  client: OkxRestClient;
}

export interface ToolSpec {
  name: string;
  /** Human-readable label shown by MCP clients (e.g. inspector tool list, Claude tool catalog). */
  title: string;
  module: ModuleId;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: OutputSchema;
  /**
   * Source of truth for `readOnlyHint`. We deliberately do NOT expose a
   * `readOnlyHint` override — destructive/idempotent hints are subordinate and
   * only meaningful when readOnlyHint=false per MCP spec.
   */
  isWrite: boolean;
  /**
   * Override for annotations.destructiveHint.
   * When omitted, defaults to `isWrite` (i.e. all writes are flagged destructive).
   * Set `false` for additive writes (place_order, transfer, subscribe, redeem).
   */
  destructiveHint?: boolean;
  /**
   * Override for annotations.idempotentHint.
   * When omitted, defaults to `!isWrite`.
   * Set `true` for write operations whose effect converges (cancel, amend, close, set).
   */
  idempotentHint?: boolean;
  handler: (args: ToolArgs, context: ToolContext) => Promise<unknown>;
}

export function toMcpTool(tool: ToolSpec): Tool {
  const destructive = tool.destructiveHint ?? tool.isWrite;
  const idempotent = tool.idempotentHint ?? !tool.isWrite;
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: {
      title: tool.title,
      readOnlyHint: !tool.isWrite,
      destructiveHint: destructive,
      idempotentHint: idempotent,
      openWorldHint: true,
    },
  };
}
