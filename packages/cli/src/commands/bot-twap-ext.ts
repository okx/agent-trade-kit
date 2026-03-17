/**
 * TWAP CLI commands (CLI-only, no MCP tool).
 *
 * These commands call OkxRestClient directly (no ToolSpec).
 * TWAP functionality is not exposed as MCP tools — use these CLI commands instead.
 */
import type { OkxRestClient } from "@agent-tradekit/core";
import { privateRateLimit, compactObject } from "@agent-tradekit/core";
import { printJson, printTable, printKv } from "../formatter.js";

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
// #1  TWAP Place Order
// POST /api/v5/trade/order-algo  (ordType=twap)
// ---------------------------------------------------------------------------

export async function cmdTwapPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    tdMode: string;
    side: string;
    sz: string;
    szLimit: string;
    pxLimit: string;
    timeInterval: string;
    posSide?: string;
    pxVar?: string;
    pxSpread?: string;
    algoClOrdId?: string;
    ccy?: string;
    tradeQuoteCcy?: string;
    reduceOnly?: boolean;
    isTradeBorrowMode?: boolean;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/trade/order-algo",
    compactObject({
      instId: opts.instId,
      tdMode: opts.tdMode,
      side: opts.side,
      ordType: "twap",
      sz: opts.sz,
      szLimit: opts.szLimit,
      pxLimit: opts.pxLimit,
      timeInterval: opts.timeInterval,
      posSide: opts.posSide,
      pxVar: opts.pxVar,
      pxSpread: opts.pxSpread,
      tag: "CLI",
      algoClOrdId: opts.algoClOrdId,
      ccy: opts.ccy,
      tradeQuoteCcy: opts.tradeQuoteCcy,
      reduceOnly: opts.reduceOnly !== undefined ? String(opts.reduceOnly) : undefined,
      isTradeBorrowMode: opts.isTradeBorrowMode !== undefined ? String(opts.isTradeBorrowMode) : undefined,
    }),
    privateRateLimit("twap_place_order", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `TWAP order placed: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #2  TWAP Cancel Order
// POST /api/v5/trade/cancel-algos
// ---------------------------------------------------------------------------

export async function cmdTwapCancel(
  client: OkxRestClient,
  opts: {
    instId: string;
    algoId?: string;
    algoClOrdId?: string;
    json: boolean;
  },
): Promise<void> {
  if (!opts.algoId && !opts.algoClOrdId) {
    throw new Error("Must provide --algoId or --algoClOrdId");
  }
  const response = await client.privatePost(
    "/api/v5/trade/cancel-algos",
    [compactObject({
      algoId: opts.algoId,
      algoClOrdId: opts.algoClOrdId,
      instId: opts.instId,
    })],
    privateRateLimit("twap_cancel_order", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `TWAP order cancelled: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #3  TWAP Get Orders (active or history)
// GET /api/v5/trade/orders-algo-pending  or  /api/v5/trade/orders-algo-history
// ---------------------------------------------------------------------------

export async function cmdTwapOrders(
  client: OkxRestClient,
  opts: {
    history: boolean;
    instId?: string;
    instType?: string;
    state?: string;
    json: boolean;
  },
): Promise<void> {
  const path = opts.history
    ? "/api/v5/trade/orders-algo-history"
    : "/api/v5/trade/orders-algo-pending";

  const response = await client.privateGet(
    path,
    compactObject({
      ordType: "twap",
      instType: opts.instType,
      instId: opts.instId,
      ...(opts.history && !opts.state
        ? { state: "effective" }
        : {}),
      ...(opts.history && opts.state
        ? { state: opts.state }
        : {}),
    }),
    privateRateLimit("twap_get_orders", 20),
  );
  const orders = getDataArray(response);
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No TWAP orders\n"); return; }
  printTable(
    orders.map((o) => ({
      algoId:       o["algoId"],
      instId:       o["instId"],
      side:         o["side"],
      state:        o["state"],
      sz:           o["sz"],
      szLimit:      o["szLimit"],
      pxLimit:      o["pxLimit"],
      timeInterval: o["timeInterval"],
      createdAt:    new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

// ---------------------------------------------------------------------------
// #4  TWAP Get Order Details
// GET /api/v5/trade/order-algo
// ---------------------------------------------------------------------------

export async function cmdTwapDetails(
  client: OkxRestClient,
  opts: {
    algoId?: string;
    algoClOrdId?: string;
    json: boolean;
  },
): Promise<void> {
  if (!opts.algoId && !opts.algoClOrdId) {
    throw new Error("Must provide --algoId or --algoClOrdId");
  }
  const response = await client.privateGet(
    "/api/v5/trade/order-algo",
    compactObject({
      algoId: opts.algoId,
      algoClOrdId: opts.algoClOrdId,
    }),
    privateRateLimit("twap_get_order_details", 20),
  );
  const data = getDataArray(response);
  const detail = data[0];
  if (!detail) { process.stdout.write("TWAP order not found\n"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:       detail["algoId"],
    instId:       detail["instId"],
    side:         detail["side"],
    state:        detail["state"],
    sz:           detail["sz"],
    szLimit:      detail["szLimit"],
    pxLimit:      detail["pxLimit"],
    pxVar:        detail["pxVar"],
    pxSpread:     detail["pxSpread"],
    timeInterval: detail["timeInterval"],
    createdAt:    new Date(Number(detail["cTime"])).toLocaleString(),
  });
}
