import type { ToolSpec, ToolArgs, ToolContext } from "../types.js";
import { ConfigError } from "../../utils/errors.js";
import { registerEarnTools } from "./savings.js";
import { registerOnchainEarnTools } from "./onchain.js";
import { registerDcdTools } from "./dcd.js";
import { registerAutoEarnTools } from "./autoearn.js";

export { registerEarnTools, registerOnchainEarnTools, registerDcdTools, registerAutoEarnTools };

const EARN_DEMO_MESSAGE =
  "Earn features (savings, DCD, on-chain staking, auto-earn) are not available in simulated trading mode.";
const EARN_DEMO_SUGGESTION = "Switch to a live account to use Earn features.";

/** Tools that bypass the blanket demo guard:
 *  - isWrite=false tools are skipped by the guard condition
 *  - dcd_redeem: isWrite=true but has CONDITIONAL demo check inside
 *    (preview/no quoteId is read-only and allowed; execute mode has assertNotDemo)
 *  - earn_fixed_purchase: isWrite=true but preview (confirm=false) is read-only;
 *    execute path (confirm=true) has assertNotDemo inside the handler */
const DEMO_GUARD_SKIP = new Set(["dcd_redeem", "earn_fixed_purchase"]);

function withDemoGuard(tool: ToolSpec): ToolSpec {
  if (!tool.isWrite || DEMO_GUARD_SKIP.has(tool.name)) return tool;
  const originalHandler = tool.handler;
  return {
    ...tool,
    handler: async (args: ToolArgs, context: ToolContext): Promise<unknown> => {
      if (context.config.demo) {
        throw new ConfigError(EARN_DEMO_MESSAGE, EARN_DEMO_SUGGESTION);
      }
      return originalHandler(args, context);
    },
  };
}

export function registerAllEarnTools(): ToolSpec[] {
  const tools = [
    ...registerEarnTools(),
    ...registerOnchainEarnTools(),
    ...registerDcdTools(),
    ...registerAutoEarnTools(),
  ];
  return tools.map(withDemoGuard);
}
