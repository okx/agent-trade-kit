import type { OkxConfig } from "../config.js";
import type { OkxRestClient } from "../client/rest-client.js";
import { MODULES, type ModuleId } from "../constants.js";
import { registerAccountTools } from "./account.js";
import { registerAlgoTradeTools, registerFuturesAlgoTools } from "./algo-trade.js";
import { registerAuditTools } from "./audit.js";
import { registerBotTools } from "./bot/index.js";
import { registerAllEarnTools } from "./earn/index.js";
import { registerFuturesTools } from "./futures-trade.js";
import { registerMarketTools } from "./market.js";
import { registerOptionAlgoTools } from "./option-algo-trade.js";
import { registerOptionTools } from "./option-trade.js";
import { registerSpotTradeTools } from "./spot-trade.js";
import { registerSwapTradeTools } from "./swap-trade.js";
import type { ToolSpec, ToolArgs } from "./types.js";

/**
 * Return specs for every registered tool across all modules.
 *
 * Exported for external consumers (e.g. diagnostic / introspection tooling)
 * that need to enumerate tool names, schemas, or module membership without
 * instantiating a full client.  Not all callers use every spec — consumers
 * should filter as needed.
 */
export function allToolSpecs(): ToolSpec[] {
  return [
    ...registerMarketTools(),
    ...registerSpotTradeTools(),
    ...registerSwapTradeTools(),
    ...registerFuturesTools(),
    ...registerFuturesAlgoTools(),
    ...registerOptionTools(),
    ...registerOptionAlgoTools(),
    ...registerAlgoTradeTools(),
    ...registerAccountTools(),
    ...registerBotTools(),
    ...registerAllEarnTools(),
    ...registerAuditTools(),
  ];
}

export function buildTools(config: OkxConfig): ToolSpec[] {
  const enabledModules = new Set(config.modules);
  const tools = allToolSpecs().filter((tool) => enabledModules.has(tool.module));
  if (!config.readOnly) {
    return tools;
  }
  return tools.filter((tool) => !tool.isWrite);
}

export interface ToolResult {
  endpoint: string;
  requestTime: string;
  data: unknown;
}

export type ToolRunner = (toolName: string, args: ToolArgs) => Promise<ToolResult>;

/**
 * Create a function that can call any registered tool by name.
 * All modules are enabled regardless of config.modules, since CLI
 * controls which commands to expose at the routing level.
 */
export function createToolRunner(client: OkxRestClient, config: OkxConfig): ToolRunner {
  const fullConfig: OkxConfig = { ...config, modules: [...MODULES] as ModuleId[], readOnly: false };
  const tools = allToolSpecs();
  const toolMap = new Map<string, ToolSpec>(tools.map((t) => [t.name, t]));

  return async (toolName: string, args: ToolArgs): Promise<ToolResult> => {
    const tool = toolMap.get(toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    const result = await tool.handler(args, { config: fullConfig, client });
    return result as ToolResult;
  };
}
