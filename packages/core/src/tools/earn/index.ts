import type { ToolSpec } from "../types.js";
import { registerEarnTools } from "./savings.js";
import { registerOnchainEarnTools } from "./onchain.js";

export function registerAllEarnTools(): ToolSpec[] {
  return [
    ...registerEarnTools(),
    ...registerOnchainEarnTools(),
  ];
}
