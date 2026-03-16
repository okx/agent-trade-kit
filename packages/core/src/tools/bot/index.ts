import type { ToolSpec } from "../types.js";
import { registerGridTools } from "./grid.js";
import { registerDcaTools } from "./dca.js";
import { registerTwapTools } from "./twap.js";

export function registerBotTools(): ToolSpec[] {
  return [
    ...registerGridTools(),
    ...registerDcaTools(),
    ...registerTwapTools(),
  ];
}
