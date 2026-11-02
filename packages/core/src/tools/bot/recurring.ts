import type { ToolArgs, ToolContext, ToolSpec } from "../types.js";
import {
  asRecord,
  assertEnum,
  compactObject,
  normalizeResponse,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";
import {
  INVESTMENT_CCYS,
  TD_MODES,
  TIME_TYPES,
  parseRecurringList,
  parseSource,
  readSchedule,
  requireStrategyName,
} from "./recurring-validation.js";
import { normalizeRecurringWrite } from "./write-result.js";
import { NetworkError, OkxApiError, OkxMcpError } from "../../utils/errors.js";

const BASE = "/api/v5/tradingBot/recurring";
/** Contract limit is 20 req / 2 s per user; stay below it. */
const RPS = 10;

const ALGO_ID_PROP = { type: "string", description: "Recurring buy strategy ID" } as const;
const SCHEDULE_PROPS = {
  period: { type: "string", enum: ["monthly", "weekly", "daily", "hourly"], description: "Recurring period" },
  recurringDay: {
    type: "string",
    description: "Day: monthly 1-28, weekly 1-7 (weekly: 1=Monday ... 7=Sunday). Not needed for daily/hourly.",
  },
  recurringHour: {
    type: "string",
    enum: ["1", "4", "8", "12"],
    description: "Hourly interval; required when period=hourly.",
  },
  timeZone: { type: "string", description: "UTC offset in [-12, 14], e.g. '8' for UTC+8" },
} as const;

type Handler = (args: ToolArgs, context: ToolContext) => Promise<unknown>;

/** Error codes whose generic hint says "retry later" (server busy / timed out): the request may still have gone through. */
const UNCERTAIN_API_CODES = new Set(["50001", "50004", "50013", "50026"]);

/**
 * A timeout, a dropped connection or a 5xx tells nothing about whether the write was executed.
 * An HTTP 5xx that carries an unmapped OKX business code reaches us as that code with a generic
 * "retry" hint and no status, so any API error whose hint says "retry" counts as uncertain too.
 * That is deliberately conservative: it costs one extra question to the user, never a duplicate buy.
 */
function isUncertainOutcome(error: unknown): error is OkxMcpError {
  if (error instanceof NetworkError) return true;
  if (error instanceof OkxApiError && error.code !== undefined) {
    // An error without a code is one of ours (e.g. "returned no algoId") and already has its own hint.
    return UNCERTAIN_API_CODES.has(error.code) || /^5\d\d$/.test(error.code) || /\bretry\b/i.test(error.suggestion ?? "");
  }
  return false;
}

/** What to read to learn whether a write happened, and whether a repeat would do it twice. */
interface WriteGuard {
  /** Read commands that show the current state, phrased to follow "Do not retry on your own: ". */
  checkHint: string;
  /** True when running the write again would create a second strategy or buy again. */
  duplicates: boolean;
}

/**
 * Replace the generic "retry later / retry in a few seconds" hint of an uncertain failure on a
 * Recurring Buy write. The write may already have been executed and the lists can lag behind it, so
 * the agent must not retry on its own: it checks, tells the user, and the user decides. A write that
 * would create a strategy or buy again also gets the duplicate warning.
 * The error is rebuilt as a plain OkxMcpError that keeps type, code, message, endpoint, traceId and
 * cause, so it is no longer `instanceof NetworkError` / `OkxApiError`; nothing on the CLI path checks that.
 */
function guardUncertainWrite(handler: Handler, guardFor: (args: ToolArgs) => WriteGuard): Handler {
  return async (rawArgs, context) => {
    try {
      return await handler(rawArgs, context);
    } catch (error) {
      if (!isUncertainOutcome(error)) throw error;
      const { checkHint, duplicates } = guardFor(rawArgs);
      const ending = duplicates
        ? "If it is still unconfirmed, tell the user and retry only after they explicitly agree (a retry may duplicate the strategy or buy again)."
        : "Tell the user what you found and let them decide whether to run it again.";
      throw new OkxMcpError(error.type, error.message, {
        code: error.code,
        endpoint: error.endpoint,
        traceId: error.traceId,
        cause: error.cause,
        suggestion: `The request may already have been executed. Do not retry on your own: ${checkHint}, wait a moment and check once more. ${ending}`,
      });
    }
  };
}

const CHECK_STATE = "run `okx bot recurring details --algoId <id>` to see the current state";
const CHECK_BUY = "check `okx bot recurring sub-orders --algoId <id>` and `details`";

/** A write that can be repeated without a second effect (pause, restart, stop, amend-*). */
function idempotentWrite(handler: Handler, checkHint: string = CHECK_STATE): Handler {
  return guardUncertainWrite(handler, () => ({ checkHint, duplicates: false }));
}

/** POST {algoId} to a lifecycle endpoint (pause / restart). */
function algoIdAction(name: string, path: string): Handler {
  return async (rawArgs, context) => {
    const algoId = requireString(asRecord(rawArgs), "algoId");
    const response = await context.client.privatePost(`${BASE}/${path}`, { algoId }, privateRateLimit(name, RPS));
    return normalizeRecurringWrite(response);
  };
}

/** POST {algoId, amount} (amend-recurring-amount / add-investment). */
function amountAction(name: string, path: string): Handler {
  return async (rawArgs, context) => {
    const args = asRecord(rawArgs);
    const algoId = requireString(args, "algoId");
    const amount = requireString(args, "amount");
    const response = await context.client.privatePost(`${BASE}/${path}`, { algoId, amount }, privateRateLimit(name, RPS));
    return normalizeRecurringWrite(response);
  };
}

/** GET with the pagination filters shared by the list endpoints. */
function pageQuery(args: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return compactObject({
    ...extra,
    after: readString(args, "after"),
    before: readString(args, "before"),
    limit: readString(args, "limit"),
  });
}

const createOrderHandlerUnguarded: Handler = async (rawArgs, context) => {
  const args = asRecord(rawArgs);
  const stgyName = requireStrategyName(args);
  const recurringList = parseRecurringList(requireString(args, "recurringList"), "create");
  const schedule = readSchedule(args, { requireTimeAndDay: true });
  const amt = requireString(args, "amt");
  const investmentCcy = requireString(args, "investmentCcy");
  assertEnum(investmentCcy, "investmentCcy", INVESTMENT_CCYS);
  const tdMode = requireString(args, "tdMode");
  assertEnum(tdMode, "tdMode", TD_MODES);
  const recurringTimeType = readString(args, "recurringTimeType");
  assertEnum(recurringTimeType, "recurringTimeType", TIME_TYPES);
  const source = parseSource(readString(args, "source"));

  const response = await context.client.privatePost(
    `${BASE}/order-algo`,
    compactObject({
      stgyName,
      recurringList,
      ...schedule,
      amt,
      investmentCcy,
      tdMode,
      algoClOrdId: readString(args, "algoClOrdId"),
      tradeQuoteCcy: readString(args, "tradeQuoteCcy"),
      source,
      recurringTimeType,
      tag: context.config.sourceTag,
    }),
    privateRateLimit("recurring_create_order", RPS),
  );
  // Unlike the amend endpoints, create must hand back the new algoId.
  return normalizeRecurringWrite(response, { requireAlgoId: true });
};

const createOrderHandler = guardUncertainWrite(createOrderHandlerUnguarded, () => ({
  checkHint:
    "run `okx bot recurring orders` (and `--history`) and look for the strategy by name and creation time (and `sub-orders` if --recurringTimeType 2 was used, since that buys right away)",
  duplicates: true,
}));

const stopHandler: Handler = async (rawArgs, context) => {
  const algoId = requireString(asRecord(rawArgs), "algoId");
  // The endpoint takes a JSON array body (max 10); we expose a single algoId. `tag` is deprecated.
  const response = await context.client.privatePost(
    `${BASE}/stop-order-algo`,
    [{ algoId }],
    privateRateLimit("recurring_stop_order", RPS),
  );
  return normalizeRecurringWrite(response);
};

const amendNameHandler: Handler = async (rawArgs, context) => {
  const args = asRecord(rawArgs);
  const algoId = requireString(args, "algoId");
  const stgyName = requireStrategyName(args);
  const response = await context.client.privatePost(
    `${BASE}/amend-order-algo`,
    { algoId, stgyName },
    privateRateLimit("recurring_amend_name", RPS),
  );
  return normalizeRecurringWrite(response);
};

const amendPriceRangeHandler: Handler = async (rawArgs, context) => {
  const args = asRecord(rawArgs);
  const algoId = requireString(args, "algoId");
  const recurringList = parseRecurringList(requireString(args, "recurringList"), "priceRange");
  const response = await context.client.privatePost(
    `${BASE}/amend-price-range`,
    { algoId, recurringList },
    privateRateLimit("recurring_amend_price_range", RPS),
  );
  return normalizeRecurringWrite(response);
};

const amendTimeHandler: Handler = async (rawArgs, context) => {
  const args = asRecord(rawArgs);
  const algoId = requireString(args, "algoId");
  const recurringTimeType = requireString(args, "recurringTimeType");
  assertEnum(recurringTimeType, "recurringTimeType", TIME_TYPES);
  // Custom time (type 1) needs day + time; immediate trigger (type 2) does not.
  const schedule = readSchedule(args, { requireTimeAndDay: recurringTimeType === "1" });
  const response = await context.client.privatePost(
    `${BASE}/amend-recurring-time`,
    compactObject({ algoId, recurringTimeType, ...schedule }),
    privateRateLimit("recurring_amend_time", RPS),
  );
  return normalizeRecurringWrite(response);
};

const getOrderDetailsHandler: Handler = async (rawArgs, context) => {
  const algoId = requireString(asRecord(rawArgs), "algoId");
  const response = await context.client.privateGet(
    `${BASE}/orders-algo-details`,
    { algoId },
    privateRateLimit("recurring_get_order_details", RPS),
  );
  return normalizeResponse(response);
};

const getOrdersHandler: Handler = async (rawArgs, context) => {
  const args = asRecord(rawArgs);
  const status = readString(args, "status") ?? "active";
  assertEnum(status, "status", ["active", "history"]);
  const endpoint = status === "history" ? "orders-algo-history" : "orders-algo-pending";
  const response = await context.client.privateGet(
    `${BASE}/${endpoint}`,
    pageQuery(args, { algoId: readString(args, "algoId") }),
    privateRateLimit("recurring_get_orders", RPS),
  );
  return normalizeResponse(response);
};

const getSubOrdersHandler: Handler = async (rawArgs, context) => {
  const args = asRecord(rawArgs);
  const algoId = requireString(args, "algoId");
  const response = await context.client.privateGet(
    `${BASE}/sub-orders`,
    pageQuery(args, { algoId, ordId: readString(args, "ordId") }),
    privateRateLimit("recurring_get_sub_orders", RPS),
  );
  return normalizeResponse(response);
};

/** Pagination filters of the list endpoints. The page-size cap differs per endpoint (orders: 100, sub-orders: 300). */
function pageProps(maxLimit: number) {
  return {
    after: { type: "string", description: "Pagination cursor: records earlier than this algoId/ordId" },
    before: { type: "string", description: "Pagination cursor: records newer than this algoId/ordId" },
    limit: { type: "string", description: `Number of results (max ${maxLimit}, default ${maxLimit})` },
  } as const;
}
const ORDERS_MAX_LIMIT = 100;
const SUB_ORDERS_MAX_LIMIT = 300;

/**
 * Recurring Buy tools. CLI-only: module `bot.recurring` is not part of
 * MODULES, so these specs are never exposed through the MCP server.
 */
export function registerRecurringTools(): ToolSpec[] {
  return [
    {
      name: "recurring_create_order",
      title: "Recurring Buy Create",
      module: "bot.recurring",
      description:
        "Create a Recurring Buy strategy that buys a basket of coins with a fixed amount each cycle. [CAUTION] Real trades. Not idempotent: on an uncertain result do not retry on your own; check first, and retry only after the user says yes. " +
        "tdMode is required and has no default, always pass it: 'cash' or 'cross'. Accepted values depend on the account mode (acctLv): 1 accepts cash, 2 accepts both (cross opens a real leveraged position), 3 and 4 use cross only (never cash).",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          stgyName: { type: "string", description: "Strategy name, at most 40 characters" },
          recurringList: {
            type: "string",
            description:
              'JSON array of {ccy, ratio, minPx?, maxPx?}; ratios are decimals. Example: [{"ccy":"BTC","ratio":"0.2"},{"ccy":"ETH","ratio":"0.8"}]',
          },
          ...SCHEDULE_PROPS,
          recurringTime: { type: "string", description: "Hour of day to buy, integer 0-23 (first buy hour when hourly)" },
          amt: { type: "string", description: "Amount invested per cycle, in investmentCcy" },
          investmentCcy: { type: "string", enum: ["USDT", "USDC"], description: "Investment currency" },
          tdMode: { type: "string", enum: ["cash", "cross"], description: "Trade mode: cash or cross; accepted values depend on acctLv (see the okx-cex-bot skill)" },
          algoClOrdId: { type: "string", description: "Client strategy ID (optional)" },
          tradeQuoteCcy: { type: "string", description: "Quote currency for trading (optional)" },
          source: { type: "string", description: "Funding sources, comma-separated: 1=trading, 2=funding, 3=simple earn (default 1)" },
          recurringTimeType: { type: "string", enum: ["1", "2"], description: "1=custom time (default), 2=immediate trigger" },
        },
        required: ["stgyName", "recurringList", "period", "recurringTime", "timeZone", "amt", "investmentCcy", "tdMode"],
      },
      handler: createOrderHandler,
    },
    {
      name: "recurring_pause",
      title: "Recurring Buy Pause",
      module: "bot.recurring",
      description: "Pause a running Recurring Buy strategy. No buys happen while paused; resume with recurring_restart.",
      isWrite: true,
      destructiveHint: false,
      idempotentHint: true,
      inputSchema: { type: "object", properties: { algoId: ALGO_ID_PROP }, required: ["algoId"] },
      handler: idempotentWrite(algoIdAction("recurring_pause", "pause")),
    },
    {
      name: "recurring_restart",
      title: "Recurring Buy Restart",
      module: "bot.recurring",
      description: "Restart a paused Recurring Buy strategy.",
      isWrite: true,
      destructiveHint: false,
      idempotentHint: true,
      inputSchema: { type: "object", properties: { algoId: ALGO_ID_PROP }, required: ["algoId"] },
      handler: idempotentWrite(algoIdAction("recurring_restart", "restart")),
    },
    {
      name: "recurring_stop_order",
      title: "Recurring Buy Stop",
      module: "bot.recurring",
      description: "[CAUTION] Stop a Recurring Buy strategy permanently. Confirm the target with the user first.",
      isWrite: true,
      inputSchema: { type: "object", properties: { algoId: ALGO_ID_PROP }, required: ["algoId"] },
      handler: idempotentWrite(stopHandler, "run `okx bot recurring details --algoId <id>` (or `orders --history`) to see whether it stopped"),
    },
    {
      name: "recurring_amend_name",
      title: "Recurring Buy Rename",
      module: "bot.recurring",
      description: "Rename a Recurring Buy strategy.",
      isWrite: true,
      destructiveHint: false,
      idempotentHint: true,
      inputSchema: {
        type: "object",
        properties: { algoId: ALGO_ID_PROP, stgyName: { type: "string", description: "New name, at most 40 characters" } },
        required: ["algoId", "stgyName"],
      },
      handler: idempotentWrite(amendNameHandler),
    },
    {
      name: "recurring_amend_price_range",
      title: "Recurring Buy Amend Price Range",
      module: "bot.recurring",
      description:
        "Change the per-coin price range in which a Recurring Buy strategy is allowed to buy. " +
        "Coins must already be part of the strategy; '' means no limit.",
      isWrite: true,
      destructiveHint: false,
      idempotentHint: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: ALGO_ID_PROP,
          recurringList: {
            type: "string",
            description: 'JSON array of {ccy, minPx, maxPx}; all three required, "" = no limit. Example: [{"ccy":"BTC","minPx":"80000","maxPx":"120000"}]',
          },
        },
        required: ["algoId", "recurringList"],
      },
      handler: idempotentWrite(amendPriceRangeHandler),
    },
    {
      name: "recurring_amend_amount",
      title: "Recurring Buy Amend Amount",
      module: "bot.recurring",
      description: "Change the amount invested per cycle (in the strategy's investment currency).",
      isWrite: true,
      destructiveHint: false,
      idempotentHint: true,
      inputSchema: {
        type: "object",
        properties: { algoId: ALGO_ID_PROP, amount: { type: "string", description: "New amount per cycle" } },
        required: ["algoId", "amount"],
      },
      handler: idempotentWrite(amountAction("recurring_amend_amount", "amend-recurring-amount")),
    },
    {
      name: "recurring_amend_time",
      title: "Recurring Buy Amend Time",
      module: "bot.recurring",
      description:
        "[CAUTION] Change the schedule of a Recurring Buy strategy. recurringTimeType 1 = custom time (needs recurringTime and, for monthly/weekly, recurringDay); " +
        "2 = trigger immediately: it makes a real purchase right away, and every call buys again (not idempotent) - do not retry it on your own.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: ALGO_ID_PROP,
          recurringTimeType: { type: "string", enum: ["1", "2"], description: "1=custom time, 2=immediate trigger" },
          ...SCHEDULE_PROPS,
          recurringTime: { type: "string", description: "Hour of day, integer 0-23 (required when recurringTimeType=1)" },
        },
        required: ["algoId", "recurringTimeType", "period", "timeZone"],
      },
      // Type 2 triggers an immediate purchase, so a repeat buys again; type 1 only sets the schedule.
      handler: guardUncertainWrite(amendTimeHandler, (args) =>
        asRecord(args)["recurringTimeType"] === "2"
          ? { checkHint: CHECK_BUY, duplicates: true }
          : { checkHint: CHECK_STATE, duplicates: false }),
    },
    {
      name: "recurring_add_investment",
      title: "Recurring Buy Add Investment",
      module: "bot.recurring",
      description: "[CAUTION] Add an extra one-off investment to a Recurring Buy strategy (real trades, in the strategy's investment currency). Not idempotent: on an uncertain result do not retry on your own; check first, and retry only after the user says yes.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: { algoId: ALGO_ID_PROP, amount: { type: "string", description: "Additional investment amount" } },
        required: ["algoId", "amount"],
      },
      handler: guardUncertainWrite(amountAction("recurring_add_investment", "add-investment"), () => ({ checkHint: CHECK_BUY, duplicates: true })),
    },
    {
      name: "recurring_get_order_details",
      title: "Recurring Buy Details",
      module: "bot.recurring",
      description: "Get one Recurring Buy strategy with schedule, per-coin holdings, average price and PnL.",
      isWrite: false,
      inputSchema: { type: "object", properties: { algoId: ALGO_ID_PROP }, required: ["algoId"] },
      handler: getOrderDetailsHandler,
    },
    {
      name: "recurring_get_orders",
      title: "Recurring Buy List",
      module: "bot.recurring",
      description: "List Recurring Buy strategies. status='active' (default) returns running/paused ones; status='history' returns stopped ones.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "history"], description: "active (default) or history" },
          algoId: { type: "string", description: "Filter by strategy ID" },
          ...pageProps(ORDERS_MAX_LIMIT),
        },
        required: [],
      },
      handler: getOrdersHandler,
    },
    {
      name: "recurring_get_sub_orders",
      title: "Recurring Buy Sub Orders",
      module: "bot.recurring",
      description: "List the buy orders a Recurring Buy strategy has executed.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { algoId: ALGO_ID_PROP, ordId: { type: "string", description: "Filter by sub order ID" }, ...pageProps(SUB_ORDERS_MAX_LIMIT) },
        required: ["algoId"],
      },
      handler: getSubOrdersHandler,
    },
  ];
}
