import type { OkxRestClient } from "@okx-hub/core";
import { printJson, printKv, printTable } from "../formatter.js";

export async function cmdSwapPositions(
  client: OkxRestClient,
  instId: string | undefined,
  json: boolean,
): Promise<void> {
  const params: Record<string, unknown> = { instType: "SWAP" };
  if (instId) params["instId"] = instId;
  const res = await client.privateGet("/api/v5/account/positions", params);
  const positions = res.data as Record<string, unknown>[];
  if (json) return printJson(positions);
  const open = (positions ?? []).filter((p) => Number(p["pos"]) !== 0);
  if (!open.length) { process.stdout.write("No open positions\n"); return; }
  printTable(
    open.map((p) => ({
      instId: p["instId"],
      side: p["posSide"],
      size: p["pos"],
      avgPx: p["avgPx"],
      upl: p["upl"],
      uplRatio: p["uplRatio"],
      lever: p["lever"],
    })),
  );
}

export async function cmdSwapOrders(
  client: OkxRestClient,
  opts: { instId?: string; status: "open" | "history"; json: boolean },
): Promise<void> {
  const endpoint =
    opts.status === "history"
      ? "/api/v5/trade/orders-history"
      : "/api/v5/trade/orders-pending";
  const params: Record<string, unknown> = { instType: "SWAP" };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.privateGet(endpoint, params);
  const orders = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(orders);
  printTable(
    (orders ?? []).map((o) => ({
      ordId: o["ordId"],
      instId: o["instId"],
      side: o["side"],
      posSide: o["posSide"],
      type: o["ordType"],
      price: o["px"],
      size: o["sz"],
      state: o["state"],
    })),
  );
}

export async function cmdSwapPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    posSide?: string;
    px?: string;
    tdMode: string;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
  };
  if (opts.posSide) body["posSide"] = opts.posSide;
  if (opts.px) body["px"] = opts.px;
  const res = await client.privatePost("/api/v5/trade/order", body);
  if (opts.json) return printJson(res.data);
  const order = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Order placed: ${order?.["ordId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`);
}

export async function cmdSwapCancel(
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

export async function cmdSwapAlgoPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    posSide?: string;
    tdMode: string;
    tpTriggerPx?: string;
    tpOrdPx?: string;
    slTriggerPx?: string;
    slOrdPx?: string;
    reduceOnly?: boolean;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
  };
  if (opts.posSide) body["posSide"] = opts.posSide;
  if (opts.tpTriggerPx) body["tpTriggerPx"] = opts.tpTriggerPx;
  if (opts.tpOrdPx) body["tpOrdPx"] = opts.tpOrdPx;
  if (opts.slTriggerPx) body["slTriggerPx"] = opts.slTriggerPx;
  if (opts.slOrdPx) body["slOrdPx"] = opts.slOrdPx;
  if (opts.reduceOnly !== undefined) body["reduceOnly"] = String(opts.reduceOnly);
  const res = await client.privatePost("/api/v5/trade/order-algo", body);
  if (opts.json) return printJson(res.data);
  const order = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Algo order placed: ${order?.["algoId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`,
  );
}

export async function cmdSwapAlgoAmend(
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

export async function cmdSwapAlgoTrailPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    side: string;
    sz: string;
    callbackRatio?: string;
    callbackSpread?: string;
    activePx?: string;
    posSide?: string;
    tdMode: string;
    reduceOnly?: boolean;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: "move_order_stop",
    sz: opts.sz,
  };
  if (opts.posSide) body["posSide"] = opts.posSide;
  if (opts.callbackRatio) body["callbackRatio"] = opts.callbackRatio;
  if (opts.callbackSpread) body["callbackSpread"] = opts.callbackSpread;
  if (opts.activePx) body["activePx"] = opts.activePx;
  if (opts.reduceOnly !== undefined) body["reduceOnly"] = String(opts.reduceOnly);
  const res = await client.privatePost("/api/v5/trade/order-algo", body);
  if (opts.json) return printJson(res.data);
  const order = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Trailing stop placed: ${order?.["algoId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`,
  );
}

export async function cmdSwapAlgoCancel(
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

export async function cmdSwapAlgoOrders(
  client: OkxRestClient,
  opts: { instId?: string; status: "pending" | "history"; ordType?: string; json: boolean },
): Promise<void> {
  const endpoint =
    opts.status === "history"
      ? "/api/v5/trade/orders-algo-history"
      : "/api/v5/trade/orders-algo-pending";
  const baseParams: Record<string, unknown> = { instType: "SWAP" };
  if (opts.instId) baseParams["instId"] = opts.instId;

  let orders: Record<string, unknown>[];
  if (opts.ordType) {
    const res = await client.privateGet(endpoint, { ...baseParams, ordType: opts.ordType });
    orders = (res.data as Record<string, unknown>[]) ?? [];
  } else {
    const [r1, r2, r3] = await Promise.all([
      client.privateGet(endpoint, { ...baseParams, ordType: "conditional" }),
      client.privateGet(endpoint, { ...baseParams, ordType: "oco" }),
      client.privateGet(endpoint, { ...baseParams, ordType: "move_order_stop" }),
    ]);
    orders = [
      ...((r1.data as Record<string, unknown>[]) ?? []),
      ...((r2.data as Record<string, unknown>[]) ?? []),
      ...((r3.data as Record<string, unknown>[]) ?? []),
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

export async function cmdSwapFills(
  client: OkxRestClient,
  opts: { instId?: string; ordId?: string; archive: boolean; json: boolean },
): Promise<void> {
  const path = opts.archive ? "/api/v5/trade/fills-history" : "/api/v5/trade/fills";
  const params: Record<string, unknown> = { instType: "SWAP" };
  if (opts.instId) params["instId"] = opts.instId;
  if (opts.ordId) params["ordId"] = opts.ordId;
  const res = await client.privateGet(path, params);
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

export async function cmdSwapGet(
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
    posSide: o["posSide"],
    ordType: o["ordType"],
    px: o["px"],
    sz: o["sz"],
    fillSz: o["fillSz"],
    avgPx: o["avgPx"],
    state: o["state"],
    cTime: new Date(Number(o["cTime"])).toLocaleString(),
  });
}

export async function cmdSwapClose(
  client: OkxRestClient,
  opts: { instId: string; mgnMode: string; posSide?: string; autoCxl?: boolean; json: boolean },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    mgnMode: opts.mgnMode,
  };
  if (opts.posSide) body["posSide"] = opts.posSide;
  if (opts.autoCxl !== undefined) body["autoCxl"] = String(opts.autoCxl);
  const res = await client.privatePost("/api/v5/trade/close-position", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Position closed: ${r?.["instId"]} ${r?.["posSide"] ?? ""}\n`);
}

export async function cmdSwapGetLeverage(
  client: OkxRestClient,
  opts: { instId: string; mgnMode: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/account/leverage-info", {
    instId: opts.instId,
    mgnMode: opts.mgnMode,
  });
  const data = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((r) => ({
      instId: r["instId"],
      mgnMode: r["mgnMode"],
      posSide: r["posSide"],
      lever: r["lever"],
    })),
  );
}

export async function cmdSwapSetLeverage(
  client: OkxRestClient,
  opts: { instId: string; lever: string; mgnMode: string; posSide?: string; json: boolean },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    lever: opts.lever,
    mgnMode: opts.mgnMode,
  };
  if (opts.posSide) body["posSide"] = opts.posSide;
  const res = await client.privatePost("/api/v5/account/set-leverage", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Leverage set: ${r?.["lever"]}x ${r?.["instId"]}\n`);
}
