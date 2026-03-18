// Aggregates all earn sub-module tools (Simple Earn + On-chain + DCD) into a single registerAllEarnTools() export.
import type { ToolSpec } from "../types.js";
import { registerEarnTools } from "./savings.js";
import { registerOnchainEarnTools } from "./onchain.js";
import { registerDcdTools } from "./dcd.js";

export { registerEarnTools, registerOnchainEarnTools, registerDcdTools };

export function registerAllEarnTools(): ToolSpec[] {
  return [
    ...registerEarnTools(),
    ...registerOnchainEarnTools(),
    ...registerDcdTools(),
  ];
}
