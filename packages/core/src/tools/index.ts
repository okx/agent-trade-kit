import type { OkxConfig } from "../config.js";
import { registerAccountTools } from "./account.js";
import { registerAlgoTradeTools } from "./algo-trade.js";
import { registerBotTools } from "./bot/index.js";
import { registerFuturesTools } from "./futures-trade.js";
import { registerMarketTools } from "./market.js";
import { registerSpotTradeTools } from "./spot-trade.js";
import { registerSwapTradeTools } from "./swap-trade.js";
import type { ToolSpec } from "./types.js";

function allToolSpecs(): ToolSpec[] {
  return [
    ...registerMarketTools(),
    ...registerSpotTradeTools(),
    ...registerSwapTradeTools(),
    ...registerFuturesTools(),
    ...registerAlgoTradeTools(),
    ...registerAccountTools(),
    ...registerBotTools(),
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
