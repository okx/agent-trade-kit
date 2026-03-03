import type { OkxRestClient } from "@okx-hub/core";
import { printJson, printKv, printTable } from "../formatter.js";

export async function cmdSpotOrders(
  client: OkxRestClient,
  opts: { instId?: string; status: "open" | "history"; json: boolean },
): Promise<void> {
  const endpoint =
    opts.status === "history"
      ? "/api/v5/trade/orders-history"
      : "/api/v5/trade/orders-pending";
  const params: Record<string, unknown> = { instType: "SPOT" };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.privateGet(endpoint, params);
  const orders = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(orders);
  printTable(
    (orders ?? []).map((o) => ({
      ordId: o["ordId"],
      instId: o["instId"],
      side: o["side"],
      type: o["ordType"],
      price: o["px"],
      size: o["sz"],
      filled: o["fillSz"],
      state: o["state"],
    })),
  );
}

export async function cmdSpotPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    px?: string;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    tdMode: "cash",
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
  };
  if (opts.px) body["px"] = opts.px;
  const res = await client.privatePost("/api/v5/trade/order", body);
  if (opts.json) return printJson(res.data);
  const order = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Order placed: ${order?.["ordId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`);
}

export async function cmdSpotCancel(
  client: OkxRestClient,
  instId: string,
  ordId: string,
  json: boolean,
): Promise<void> {
  const res = await client.privatePost("/api/v5/trade/cancel-order", { instId, ordId });
  if (json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Cancelled: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
}

export async function cmdSpotAlgoPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    tpTriggerPx?: string;
    tpOrdPx?: string;
    slTriggerPx?: string;
    slOrdPx?: string;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    tdMode: "cash",
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
  };
  if (opts.tpTriggerPx) body["tpTriggerPx"] = opts.tpTriggerPx;
  if (opts.tpOrdPx) body["tpOrdPx"] = opts.tpOrdPx;
  if (opts.slTriggerPx) body["slTriggerPx"] = opts.slTriggerPx;
  if (opts.slOrdPx) body["slOrdPx"] = opts.slOrdPx;
  const res = await client.privatePost("/api/v5/trade/order-algo", body);
  if (opts.json) return printJson(res.data);
  const order = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Algo order placed: ${order?.["algoId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`,
  );
}

export async function cmdSpotAlgoAmend(
  client: OkxRestClient,
  opts: {
    instId: string;
    algoId: string;
    newSz?: string;
    newTpTriggerPx?: string;
    newTpOrdPx?: string;
    newSlTriggerPx?: string;
    newSlOrdPx?: string;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    algoId: opts.algoId,
  };
  if (opts.newSz) body["newSz"] = opts.newSz;
  if (opts.newTpTriggerPx) body["newTpTriggerPx"] = opts.newTpTriggerPx;
  if (opts.newTpOrdPx) body["newTpOrdPx"] = opts.newTpOrdPx;
  if (opts.newSlTriggerPx) body["newSlTriggerPx"] = opts.newSlTriggerPx;
  if (opts.newSlOrdPx) body["newSlOrdPx"] = opts.newSlOrdPx;
  const res = await client.privatePost("/api/v5/trade/amend-algos", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Algo order amended: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdSpotAlgoCancel(
  client: OkxRestClient,
  instId: string,
  algoId: string,
  json: boolean,
): Promise<void> {
  const res = await client.privatePost("/api/v5/trade/cancel-algos", [
    { algoId, instId },
  ]);
  if (json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Algo order cancelled: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdSpotGet(
  client: OkxRestClient,
  opts: { instId: string; ordId?: string; clOrdId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instId: opts.instId };
  if (opts.ordId) params["ordId"] = opts.ordId;
  if (opts.clOrdId) params["clOrdId"] = opts.clOrdId;
  const res = await client.privateGet("/api/v5/trade/order", params);
  const data = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const o = data?.[0];
  if (!o) { process.stdout.write("No data\n"); return; }
  printKv({
    ordId: o["ordId"],
    instId: o["instId"],
    side: o["side"],
    ordType: o["ordType"],
    px: o["px"],
    sz: o["sz"],
    fillSz: o["fillSz"],
    avgPx: o["avgPx"],
    state: o["state"],
    cTime: new Date(Number(o["cTime"])).toLocaleString(),
  });
}

export async function cmdSpotAmend(
  client: OkxRestClient,
  opts: {
    instId: string;
    ordId?: string;
    clOrdId?: string;
    newSz?: string;
    newPx?: string;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = { instId: opts.instId };
  if (opts.ordId) body["ordId"] = opts.ordId;
  if (opts.clOrdId) body["clOrdId"] = opts.clOrdId;
  if (opts.newSz) body["newSz"] = opts.newSz;
  if (opts.newPx) body["newPx"] = opts.newPx;
  const res = await client.privatePost("/api/v5/trade/amend-order", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Order amended: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
}

export async function cmdSpotAlgoOrders(
  client: OkxRestClient,
  opts: { instId?: string; status: "pending" | "history"; ordType?: string; json: boolean },
): Promise<void> {
  const endpoint =
    opts.status === "history"
      ? "/api/v5/trade/orders-algo-history"
      : "/api/v5/trade/orders-algo-pending";
  const baseParams: Record<string, unknown> = { instType: "SPOT" };
  if (opts.instId) baseParams["instId"] = opts.instId;

  let orders: Record<string, unknown>[];
  if (opts.ordType) {
    const res = await client.privateGet(endpoint, { ...baseParams, ordType: opts.ordType });
    orders = (res.data as Record<string, unknown>[]) ?? [];
  } else {
    const [r1, r2] = await Promise.all([
      client.privateGet(endpoint, { ...baseParams, ordType: "conditional" }),
      client.privateGet(endpoint, { ...baseParams, ordType: "oco" }),
    ]);
    orders = [
      ...((r1.data as Record<string, unknown>[]) ?? []),
      ...((r2.data as Record<string, unknown>[]) ?? []),
    ];
  }

  if (opts.json) return printJson(orders);
  if (!(orders ?? []).length) { process.stdout.write("No algo orders\n"); return; }
  printTable(
    orders.map((o) => ({
      algoId: o["algoId"],
      instId: o["instId"],
      type: o["ordType"],
      side: o["side"],
      sz: o["sz"],
      tpTrigger: o["tpTriggerPx"],
      slTrigger: o["slTriggerPx"],
      state: o["state"],
    })),
  );
}

export async function cmdSpotFills(
  client: OkxRestClient,
  opts: { instId?: string; ordId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instType: "SPOT" };
  if (opts.instId) params["instId"] = opts.instId;
  if (opts.ordId) params["ordId"] = opts.ordId;
  const res = await client.privateGet("/api/v5/trade/fills", params);
  const fills = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(fills);
  printTable(
    (fills ?? []).map((f) => ({
      instId: f["instId"],
      side: f["side"],
      fillPx: f["fillPx"],
      fillSz: f["fillSz"],
      fee: f["fee"],
      ts: new Date(Number(f["ts"])).toLocaleString(),
    })),
  );
}
