import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";

export function registerAutoEarnTools(): ToolSpec[] {
  return [
    {
      name: "earn_auto_set",
      module: "earn.autoearn",
      description:
        "Enable or disable auto-earn for a currency. " +
        "earnType='0' for auto-lend+stake (most currencies); earnType='1' for USDG earn (USDG, BUIDL). " +
        "Use account_get_balance first: if autoLendStatus or autoStakingStatus != 'unsupported', use earnType='0'; for USDG/BUIDL use earnType='1'. " +
        "[CAUTION] Cannot disable within 24h of enabling.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency, e.g. SOL, USDG",
          },
          action: {
            type: "string",
            description: "turn_on or turn_off",
          },
          earnType: {
            type: "string",
            description: "0=auto-lend+stake (default), 1=USDG earn. Omit to use default.",
          },
        },
        required: ["ccy", "action"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/account/set-auto-earn",
          compactObject({
            ccy: requireString(args, "ccy"),
            action: requireString(args, "action"),
            earnType: readString(args, "earnType") ?? "0",
          }),
          privateRateLimit("earn_auto_set", 10),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
