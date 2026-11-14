import type { ToolSpec } from "../types.js";
import { asRecord, compactObject, normalizeResponse, requireString } from "../helpers.js";
import { privateRateLimit } from "../common.js";
import {
  normalizeAddInvest,
  normalizeTradeQuoteCcy,
  parsePortfolioListJson,
  validateAndNormalizePortfolioList,
} from "./smart-portfolio-validation.js";

/**
 * Operation tools for a running Smart Portfolio: manual pause / resume, add
 * investment, edit portfolio. On success the backend returns `code=0, msg="",
 * data=[]`; the REST client already turns any non-zero code into an OkxApiError
 * (code / msg / endpoint preserved), so handlers only normalise the response and
 * never read `data[0]` / `sCode`.
 *
 * Rate limit: these tools reuse the module's client-side default (20/s). That is
 * a local throttle, not a verified server-side quota.
 *
 * None of these calls passes retryOnNetworkError: an add-investment / edit may
 * already have been executed when the connection drops, so a blind retry could
 * move funds twice.
 */

const BASE = "/api/v5/tradingBot/smart-portfolio";
const RATE_LIMIT_RPS = 20;

const ALGO_ID_PROP = { type: "string", description: "Smart Portfolio strategy ID" } as const;

const TRADE_QUOTE_CCY_PROP = {
  type: "string",
  description:
    "Optional settlement currency of the top-up. Omit or leave blank to use the strategy's own settlement currency; " +
    "a non-empty value must match it exactly (case preserved) or the request is rejected.",
} as const;

export function registerSmartPortfolioOperationTools(): ToolSpec[] {
  return [
    {
      name: "smart_portfolio_manual_pause",
      title: "Smart Portfolio Manual Pause",
      module: "bot.smartportfolio",
      description:
        "Pause automatic rebalancing of a running Smart Portfolio bot. [CAUTION] Affects a real-funds strategy. " +
        "Does not stop the strategy or sell any asset. Only a running bot that is not mid-rebalance and not already " +
        "manually paused is eligible. Confirm the target algoId with the user first.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: { algoId: ALGO_ID_PROP },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const response = await context.client.privatePost(
          `${BASE}/manual-pause`,
          { algoId },
          privateRateLimit("smart_portfolio_manual_pause", RATE_LIMIT_RPS),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "smart_portfolio_manual_resume",
      title: "Smart Portfolio Manual Resume",
      module: "bot.smartportfolio",
      description:
        "Resume a manually paused Smart Portfolio bot and trigger an immediate rebalance check. [CAUTION] Real trades " +
        "may follow, but a check does not guarantee any trade. Rejected if the bot is not manually paused, is still " +
        "restricted for another reason, or has a top-up in transit.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: { algoId: ALGO_ID_PROP },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const response = await context.client.privatePost(
          `${BASE}/manual-resume`,
          { algoId },
          privateRateLimit("smart_portfolio_manual_resume", RATE_LIMIT_RPS),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "smart_portfolio_add_investment",
      title: "Smart Portfolio Add Investment",
      module: "bot.smartportfolio",
      description:
        "Add funds to a running Smart Portfolio bot without changing its target coins or weights. [CAUTION] Moves real " +
        "funds. A successful response means the request was accepted; it does not mean the funds have arrived or any " +
        "trade was executed. Check the trading-account available balance and confirm the amount with the user first.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: ALGO_ID_PROP,
          addInvest: {
            type: "string",
            description: "Amount to add, a positive decimal string (e.g. '100'), in the strategy's settlement currency.",
          },
          tradeQuoteCcy: TRADE_QUOTE_CCY_PROP,
        },
        required: ["algoId", "addInvest"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const addInvest = normalizeAddInvest(args["addInvest"], "required");
        const tradeQuoteCcy = normalizeTradeQuoteCcy(args["tradeQuoteCcy"]);
        const response = await context.client.privatePost(
          `${BASE}/add-investment`,
          compactObject({ algoId, addInvest, tradeQuoteCcy }),
          privateRateLimit("smart_portfolio_add_investment", RATE_LIMIT_RPS),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "smart_portfolio_edit_portfolio",
      title: "Smart Portfolio Edit Portfolio",
      module: "bot.smartportfolio",
      description:
        "Replace the full target coins and weights of a running combined-mode Smart Portfolio bot, optionally adding " +
        "funds. [CAUTION] Takes effect immediately and triggers rebalancing with real trades; with a top-up the " +
        "rebalance waits for the funds to arrive, and a failed top-up does not roll the edit back. portfolioList is " +
        "the complete new list, not a delta; the user must supply every coin and weight.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: ALGO_ID_PROP,
          portfolioList: {
            type: "string",
            description:
              "JSON array of {ccy, ratio}: the complete new target. 2–10 unique coins, weights are decimal strings " +
              "that sum to exactly 1. " +
              'Example: [{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]',
          },
          addInvest: {
            type: "string",
            description: "Optional top-up amount (positive decimal string). Omit, blank or zero means no top-up.",
          },
          tradeQuoteCcy: TRADE_QUOTE_CCY_PROP,
        },
        required: ["algoId", "portfolioList"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const portfolioList = validateAndNormalizePortfolioList(
          parsePortfolioListJson(requireString(args, "portfolioList")),
        );
        const addInvest = normalizeAddInvest(args["addInvest"], "optional");
        // Without a top-up tradeQuoteCcy is ignored (not even validated) and neither field is sent.
        const tradeQuoteCcy = addInvest === undefined ? undefined : normalizeTradeQuoteCcy(args["tradeQuoteCcy"]);
        const response = await context.client.privatePost(
          `${BASE}/edit-portfolio`,
          compactObject({ algoId, portfolioList, addInvest, tradeQuoteCcy }),
          privateRateLimit("smart_portfolio_edit_portfolio", RATE_LIMIT_RPS),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
