import type { OkxRestClient } from "@okx-hub/core";
import { printJson, printTable, printKv } from "../formatter.js";

// ─── grid orders ─────────────────────────────────────────────────────────────

export async function cmdGridOrders(
  client: OkxRestClient,
  opts: {
    algoOrdType: string;
    instId?: string;
    algoId?: string;
    status: "active" | "history";
    json: boolean;
  },
): Promise<void> {
  const path =
    opts.status === "history"
      ? "/api/v5/tradingBot/grid/orders-algo-history"
      : "/api/v5/tradingBot/grid/orders-algo-pending";
  const params: Record<string, unknown> = { algoOrdType: opts.algoOrdType };
  if (opts.instId) params["instId"] = opts.instId;
  if (opts.algoId) params["algoId"] = opts.algoId;
  const res = await client.privateGet(path, params);
  const orders = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No grid bots\n"); return; }
  printTable(
    orders.map((o) => ({
      algoId:     o["algoId"],
      instId:     o["instId"],
      type:       o["algoOrdType"],
      state:      o["state"],
      pnl:        o["pnlRatio"],
      gridNum:    o["gridNum"],
      maxPx:      o["maxPx"],
      minPx:      o["minPx"],
      createdAt:  new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

// ─── grid details ─────────────────────────────────────────────────────────────

export async function cmdGridDetails(
  client: OkxRestClient,
  opts: { algoOrdType: string; algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/grid/orders-algo-details", {
    algoOrdType: opts.algoOrdType,
    algoId: opts.algoId,
  });
  const detail = ((res.data as Record<string, unknown>[]) ?? [])[0];
  if (!detail) { process.stdout.write("Bot not found\n"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:       detail["algoId"],
    instId:       detail["instId"],
    type:         detail["algoOrdType"],
    state:        detail["state"],
    maxPx:        detail["maxPx"],
    minPx:        detail["minPx"],
    gridNum:      detail["gridNum"],
    runType:      detail["runType"] === "1" ? "arithmetic" : "geometric",
    pnl:          detail["pnl"],
    pnlRatio:     detail["pnlRatio"],
    investAmt:    detail["investAmt"],
    totalAnnRate: detail["totalAnnRate"],
    createdAt:    new Date(Number(detail["cTime"])).toLocaleString(),
  });
}

// ─── grid sub-orders ──────────────────────────────────────────────────────────

export async function cmdGridSubOrders(
  client: OkxRestClient,
  opts: {
    algoOrdType: string;
    algoId: string;
    type: "filled" | "live";
    json: boolean;
  },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/grid/sub-orders", {
    algoOrdType: opts.algoOrdType,
    algoId: opts.algoId,
    type: opts.type,
  });
  const orders = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No sub-orders\n"); return; }
  printTable(
    orders.map((o) => ({
      ordId:   o["ordId"],
      side:    o["side"],
      px:      o["px"],
      sz:      o["sz"],
      fillPx:  o["fillPx"],
      fillSz:  o["fillSz"],
      state:   o["state"],
      fee:     o["fee"],
    })),
  );
}

// ─── grid create ──────────────────────────────────────────────────────────────

export async function cmdGridCreate(
  client: OkxRestClient,
  opts: {
    instId: string;
    algoOrdType: string;
    maxPx: string;
    minPx: string;
    gridNum: string;
    runType?: string;
    quoteSz?: string;
    baseSz?: string;
    direction?: string;
    lever?: string;
    sz?: string;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId:      opts.instId,
    algoOrdType: opts.algoOrdType,
    maxPx:       opts.maxPx,
    minPx:       opts.minPx,
    gridNum:     opts.gridNum,
  };
  if (opts.runType)   body["runType"]   = opts.runType;
  if (opts.quoteSz)   body["quoteSz"]   = opts.quoteSz;
  if (opts.baseSz)    body["baseSz"]    = opts.baseSz;
  if (opts.direction) body["direction"] = opts.direction;
  if (opts.lever)     body["lever"]     = opts.lever;
  if (opts.sz)        body["sz"]        = opts.sz;
  const res = await client.privatePost("/api/v5/tradingBot/grid/order-algo", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Grid bot created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

// ─── grid stop ────────────────────────────────────────────────────────────────

export async function cmdGridStop(
  client: OkxRestClient,
  opts: {
    algoId: string;
    algoOrdType: string;
    instId: string;
    stopType?: string;
    json: boolean;
  },
): Promise<void> {
  const entry: Record<string, unknown> = {
    algoId:      opts.algoId,
    algoOrdType: opts.algoOrdType,
    instId:      opts.instId,
  };
  if (opts.stopType) entry["stopType"] = opts.stopType;
  const res = await client.privatePost("/api/v5/tradingBot/grid/stop-order-algo", [entry]);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Grid bot stopped: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}
