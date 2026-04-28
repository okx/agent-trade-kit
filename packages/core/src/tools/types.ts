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
  module: ModuleId;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: OutputSchema;
  isWrite: boolean;
  /**
   * Optional MCP tool-call annotations (mcp-builder G1 hint set).
   * When omitted, `toMcpTool` derives sensible defaults from `isWrite`.
   * Typed instead of `Record<string, boolean>` so typos like `readonlyHint`
   * (lowercase n) get caught at compile time.
   */
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: (args: ToolArgs, context: ToolContext) => Promise<unknown>;
}

export function toMcpTool(tool: ToolSpec): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: tool.annotations ?? {
      readOnlyHint: !tool.isWrite,
      destructiveHint: tool.isWrite,
      idempotentHint: !tool.isWrite,
      openWorldHint: true,
    },
  };
}
