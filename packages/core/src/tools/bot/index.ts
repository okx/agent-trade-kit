import type { ToolSpec } from "../types.js";
import { registerGridTools } from "./grid.js";
import { registerDcaTools } from "./dca.js";
import { registerSmartPortfolioTools } from "./smart-portfolio.js";

export function registerBotTools(): ToolSpec[] {
  return [
    ...registerGridTools(),
    ...registerDcaTools(),
    ...registerSmartPortfolioTools(),
  ];
}
