import type { ToolRunner } from "@agent-tradekit/core";
import { outputLine, printJson, printKv, printTable } from "../formatter.js";

// ---------------------------------------------------------------------------
// Recurring Buy (定投) commands
//
// Write tools throw OkxApiError when an item reports sCode != 0 or the response
// envelope reports a top-level code other than "0", and four
// endpoints (amend-time, amend-amount, amend-price-range, add-investment)
// return no data on success. So a returned write is a success (create is the one
// exception: the tool rejects a response without an algoId) and the strategy id
// falls back to the one the caller passed in.
// ---------------------------------------------------------------------------

function getItems(result: unknown): Record<string, unknown>[] {
  const data = (result as Record<string, unknown>).data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function formatTime(value: unknown): string {
  return value ? new Date(Number(value)).toLocaleString() : "";
}

function emitOk(label: string, items: Record<string, unknown>[], fallbackId?: string, json?: boolean): void {
  if (json) return printJson(items);
  // An empty algoId counts as missing, so the requested id is shown instead of a blank.
  const rawId = items[0]?.["algoId"];
  const id = rawId === undefined || rawId === null || rawId === "" ? (fallbackId ?? "") : String(rawId);
  outputLine(`${label}: ${id} (OK)`);
}

interface CreateOpts {
  stgyName: string;
  recurringList: string;
  period: string;
  recurringDay?: string;
  recurringHour?: string;
  recurringTime: string;
  timeZone: string;
  amt: string;
  investmentCcy: string;
  tdMode?: string;
  algoClOrdId?: string;
  tradeQuoteCcy?: string;
  source?: string;
  recurringTimeType?: string;
  aiBuilderCode?: string;
  json: boolean;
}

export async function cmdRecurringCreate(run: ToolRunner, opts: CreateOpts): Promise<void> {
  const { json, ...args } = opts;
  const result = await run("recurring_place_order", args);
  emitOk("Recurring Buy created", getItems(result), undefined, json);
}

export async function cmdRecurringOrders(
  run: ToolRunner,
  opts: { history?: boolean; algoId?: string; after?: string; before?: string; limit?: string; json: boolean },
): Promise<void> {
  const result = await run("recurring_get_orders", {
    status: opts.history ? "history" : "active",
    algoId: opts.algoId,
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  });
  const orders = getItems(result);
  if (opts.json) return printJson(orders);
  if (!orders.length) {
    outputLine(opts.history ? "No Recurring Buy history" : "No Recurring Buy strategies");
    return;
  }
  printTable(
    orders.map((o) => ({
      algoId:        o["algoId"],
      stgyName:      o["stgyName"],
      state:         o["state"],
      period:        o["period"],
      amt:           o["amt"],
      investmentCcy: o["investmentCcy"],
      cycles:        o["cycles"],
      totalPnl:      o["totalPnl"],
      pnlRatio:      o["pnlRatio"],
      createdAt:     formatTime(o["cTime"]),
    })),
  );
}

export async function cmdRecurringDetails(
  run: ToolRunner,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const result = await run("recurring_get_order_details", { algoId: opts.algoId });
  const detail = getItems(result)[0];
  if (!detail) { outputLine("Recurring Buy strategy not found"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:         detail["algoId"],
    stgyName:       detail["stgyName"],
    state:          detail["state"],
    period:         detail["period"],
    recurringDay:   detail["recurringDay"],
    recurringHour:  detail["recurringHour"],
    recurringTime:  detail["recurringTime"],
    timeZone:       detail["timeZone"],
    amt:            detail["amt"],
    investmentCcy:  detail["investmentCcy"],
    investmentAmt:  detail["investmentAmt"],
    cycles:         detail["cycles"],
    nextInvestTime: formatTime(detail["nextInvestTime"]),
    mktCap:         detail["mktCap"],
    totalPnl:       detail["totalPnl"],
    pnlRatio:       detail["pnlRatio"],
    totalAnnRate:   detail["totalAnnRate"],
    createdAt:      formatTime(detail["cTime"]),
  });
  const coins = detail["recurringList"];
  if (Array.isArray(coins) && coins.length) {
    outputLine("");
    printTable(
      (coins as Record<string, unknown>[]).map((c) => ({
        ccy:      c["ccy"],
        ratio:    c["ratio"],
        minPx:    c["minPx"],
        maxPx:    c["maxPx"],
        totalAmt: c["totalAmt"],
        avgPx:    c["avgPx"],
        px:       c["px"],
        profit:   c["profit"],
      })),
    );
  }
}

export async function cmdRecurringSubOrders(
  run: ToolRunner,
  opts: { algoId: string; ordId?: string; after?: string; before?: string; limit?: string; json: boolean },
): Promise<void> {
  const result = await run("recurring_get_sub_orders", {
    algoId: opts.algoId,
    ordId: opts.ordId,
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  });
  const orders = getItems(result);
  if (opts.json) return printJson(orders);
  if (!orders.length) { outputLine("No Recurring Buy sub orders"); return; }
  printTable(
    orders.map((o) => ({
      ordId:     o["ordId"],
      instId:    o["instId"],
      side:      o["side"],
      ordType:   o["ordType"],
      sz:        o["sz"],
      avgPx:     o["avgPx"],
      accFillSz: o["accFillSz"],
      state:     o["state"],
      createdAt: formatTime(o["cTime"]),
    })),
  );
}

async function simpleAction(
  run: ToolRunner,
  tool: string,
  args: Record<string, unknown>,
  label: string,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const result = await run(tool, args);
  emitOk(label, getItems(result), opts.algoId, opts.json);
}

export function cmdRecurringPause(run: ToolRunner, opts: { algoId: string; json: boolean }): Promise<void> {
  return simpleAction(run, "recurring_pause", { algoId: opts.algoId }, "Recurring Buy paused", opts);
}

export function cmdRecurringRestart(run: ToolRunner, opts: { algoId: string; json: boolean }): Promise<void> {
  return simpleAction(run, "recurring_restart", { algoId: opts.algoId }, "Recurring Buy restarted", opts);
}

export function cmdRecurringStop(run: ToolRunner, opts: { algoId: string; json: boolean }): Promise<void> {
  return simpleAction(run, "recurring_stop", { algoId: opts.algoId }, "Recurring Buy stopped", opts);
}

export function cmdRecurringAmendName(
  run: ToolRunner,
  opts: { algoId: string; stgyName: string; json: boolean },
): Promise<void> {
  return simpleAction(
    run,
    "recurring_amend_name",
    { algoId: opts.algoId, stgyName: opts.stgyName },
    "Recurring Buy renamed",
    opts,
  );
}

export function cmdRecurringAmendPriceRange(
  run: ToolRunner,
  opts: { algoId: string; recurringList: string; json: boolean },
): Promise<void> {
  return simpleAction(
    run,
    "recurring_amend_price_range",
    { algoId: opts.algoId, recurringList: opts.recurringList },
    "Recurring Buy price range amended",
    opts,
  );
}

export function cmdRecurringAmendAmount(
  run: ToolRunner,
  opts: { algoId: string; amount: string; json: boolean },
): Promise<void> {
  return simpleAction(
    run,
    "recurring_amend_amount",
    { algoId: opts.algoId, amount: opts.amount },
    "Recurring Buy amount amended",
    opts,
  );
}

export function cmdRecurringAddInvestment(
  run: ToolRunner,
  opts: { algoId: string; amount: string; json: boolean },
): Promise<void> {
  return simpleAction(
    run,
    "recurring_add_investment",
    { algoId: opts.algoId, amount: opts.amount },
    "Recurring Buy investment added",
    opts,
  );
}

export function cmdRecurringAmendTime(
  run: ToolRunner,
  opts: {
    algoId: string;
    recurringTimeType: string;
    period: string;
    timeZone: string;
    recurringDay?: string;
    recurringHour?: string;
    recurringTime?: string;
    json: boolean;
  },
): Promise<void> {
  const { json, ...args } = opts;
  return simpleAction(run, "recurring_amend_time", args, "Recurring Buy time amended", { algoId: opts.algoId, json });
}
