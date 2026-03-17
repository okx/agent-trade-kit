/**
 * Recurring Buy (Spot 定投) CLI commands.
 *
 * These commands call OkxRestClient directly (no MCP ToolSpec).
 * They cover 7 Recurring Buy OpenAPIs:
 *   - order-algo (create)
 *   - amend-order-algo (amend)
 *   - stop-order-algo (stop)
 *   - orders-algo-pending / orders-algo-history (list)
 *   - orders-algo-details (details)
 *   - sub-orders (sub-orders)
 */
import type { OkxRestClient } from "@agent-tradekit/core";
import { DEFAULT_SOURCE_TAG, privateRateLimit, compactObject } from "@agent-tradekit/core";
import { printJson, printTable, printKv } from "../formatter.js";

const BASE = "/api/v5/tradingBot/recurring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDataArray(result: { data: unknown }): Record<string, unknown>[] {
  return (result.data as Record<string, unknown>[]) ?? [];
}

function printWriteResult(
  data: Record<string, unknown>[],
  successMsg: string,
): void {
  const r = data[0];
  if (!r) {
    process.stdout.write("No response data\n");
    return;
  }
  const sCode = r["sCode"];
  if (sCode !== undefined && sCode !== "0") {
    process.stdout.write(`Error: [${sCode}] ${r["sMsg"] ?? "Operation failed"}\n`);
    return;
  }
  process.stdout.write(`${successMsg}\n`);
}

// ---------------------------------------------------------------------------
// #1  Create Recurring Buy
// POST /api/v5/tradingBot/recurring/order-algo
// ---------------------------------------------------------------------------

export async function cmdRecurringCreate(
  client: OkxRestClient,
  opts: {
    stgyName: string;
    recurringList: string;
    period: string;
    recurringDay?: string;
    recurringTime: string;
    recurringHour?: string;
    timeZone: string;
    amt: string;
    investmentCcy: string;
    tdMode: string;
    tradeQuoteCcy?: string;
    algoClOrdId?: string;
    json: boolean;
  },
): Promise<void> {
  // Parse and validate recurringList JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(opts.recurringList);
  } catch {
    throw new Error("recurringList must be a valid JSON array, e.g. '[{\"ccy\":\"BTC\",\"ratio\":\"1\"}]'");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("recurringList must be a non-empty array of {ccy, ratio} objects");
  }

  // Validate hourly period requires recurringHour
  if (opts.period === "hourly" && !opts.recurringHour) {
    throw new Error("recurringHour is required when period=hourly (valid: 1, 4, 8, 12)");
  }

  const body = compactObject({
    stgyName: opts.stgyName,
    recurringList: parsed,
    period: opts.period,
    recurringDay: opts.recurringDay,
    recurringTime: opts.recurringTime,
    recurringHour: opts.recurringHour,
    timeZone: opts.timeZone,
    amt: opts.amt,
    investmentCcy: opts.investmentCcy,
    tdMode: opts.tdMode,
    tradeQuoteCcy: opts.tradeQuoteCcy,
    algoClOrdId: opts.algoClOrdId,
    tag: DEFAULT_SOURCE_TAG,
  });

  const response = await client.privatePost(
    `${BASE}/order-algo`,
    body,
    privateRateLimit("recurring_create", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const r = data[0];
  process.stdout.write(
    `Recurring buy created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

// ---------------------------------------------------------------------------
// #2  Amend Recurring Buy
// POST /api/v5/tradingBot/recurring/amend-order-algo
// ---------------------------------------------------------------------------

export async function cmdRecurringAmend(
  client: OkxRestClient,
  opts: { algoId: string; stgyName: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/amend-order-algo`,
    { algoId: opts.algoId, stgyName: opts.stgyName },
    privateRateLimit("recurring_amend", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const r = data[0];
  process.stdout.write(
    `Recurring buy amended: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

// ---------------------------------------------------------------------------
// #3  Stop Recurring Buy
// POST /api/v5/tradingBot/recurring/stop-order-algo
// Note: API expects array body [{algoId}], not object
// ---------------------------------------------------------------------------

export async function cmdRecurringStop(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/stop-order-algo`,
    [{ algoId: opts.algoId }],
    privateRateLimit("recurring_stop", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const r = data[0];
  process.stdout.write(
    `Recurring buy stopped: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

// ---------------------------------------------------------------------------
// #4  List Recurring Buy Orders
// GET /api/v5/tradingBot/recurring/orders-algo-pending (active)
// GET /api/v5/tradingBot/recurring/orders-algo-history (history)
// ---------------------------------------------------------------------------

export async function cmdRecurringOrders(
  client: OkxRestClient,
  opts: { algoId?: string; history: boolean; json: boolean },
): Promise<void> {
  const endpoint = opts.history
    ? `${BASE}/orders-algo-history`
    : `${BASE}/orders-algo-pending`;
  const params = compactObject({ algoId: opts.algoId });
  const response = await client.privateGet(
    endpoint,
    params,
    privateRateLimit("recurring_orders", 20),
  );
  const orders = getDataArray(response);
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No recurring buy orders\n"); return; }
  printTable(
    orders.map((o) => ({
      algoId:    o["algoId"],
      stgyName:  o["stgyName"],
      state:     o["state"],
      amt:       o["amt"],
      period:    o["period"],
      ccy:       o["investmentCcy"],
      createdAt: new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

// ---------------------------------------------------------------------------
// #5  Recurring Buy Details
// GET /api/v5/tradingBot/recurring/orders-algo-details
// ---------------------------------------------------------------------------

export async function cmdRecurringDetails(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const response = await client.privateGet(
    `${BASE}/orders-algo-details`,
    { algoId: opts.algoId },
    privateRateLimit("recurring_details", 20),
  );
  const detail = getDataArray(response)[0];
  if (!detail) { process.stdout.write("Recurring buy not found\n"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:        detail["algoId"],
    stgyName:      detail["stgyName"],
    state:         detail["state"],
    amt:           detail["amt"],
    investmentCcy: detail["investmentCcy"],
    period:        detail["period"],
    recurringDay:  detail["recurringDay"],
    recurringTime: detail["recurringTime"],
    tdMode:        detail["tdMode"],
    totalAmt:      detail["totalAmt"],
    totalPnl:      detail["totalPnl"],
    createdAt:     new Date(Number(detail["cTime"])).toLocaleString(),
  });
}

// ---------------------------------------------------------------------------
// #6  Recurring Buy Sub-Orders
// GET /api/v5/tradingBot/recurring/sub-orders
// ---------------------------------------------------------------------------

export async function cmdRecurringSubOrders(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const response = await client.privateGet(
    `${BASE}/sub-orders`,
    { algoId: opts.algoId },
    privateRateLimit("recurring_sub_orders", 20),
  );
  const orders = getDataArray(response);
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No sub-orders\n"); return; }
  printTable(
    orders.map((o) => ({
      ordId:   o["ordId"],
      ccy:     o["ccy"],
      amt:     o["amt"],
      px:      o["px"],
      sz:      o["sz"],
      state:   o["state"],
      ts:      o["ts"] ? new Date(Number(o["ts"] as string)).toLocaleString() : "",
    })),
  );
}
