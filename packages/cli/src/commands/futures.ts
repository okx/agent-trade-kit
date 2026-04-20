import type { ToolRunner } from "@agent-tradekit/core";
import { errorLine, outputLine, printJson, printKv, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

function emitWriteResult(item: Record<string, unknown> | undefined, label: string, idKey: string): void {
  const isError = item?.["sCode"] !== "0" && item?.["sCode"] !== 0;
  if (isError) {
    errorLine(`Error: ${item?.["sMsg"]} (sCode ${item?.["sCode"]})`);
  } else {
    outputLine(`${label}: ${item?.[idKey]} (OK)`);
  }
}

function emitBatchResults(items: Record<string, unknown>[]): void {
  for (const r of items) {
    const isError = r["sCode"] !== "0" && r["sCode"] !== 0;
    const id = r["ordId"] ?? r["clOrdId"] ?? "?";
    if (isError) {
      errorLine(`${id}: ${r["sMsg"]} (sCode ${r["sCode"]})`);
    } else {
      outputLine(`${id}: OK`);
    }
  }
}

export async function cmdFuturesOrders(
  run: ToolRunner,
  opts: { instId?: string; status: "open" | "history" | "archive"; json: boolean },
): Promise<void> {
  const result = await run("futures_get_orders", { instId: opts.instId, status: opts.status });
  const orders = getData(result) as Record<string, unknown>[];
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

export async function cmdFuturesPositions(
  run: ToolRunner,
  instId: string | undefined,
  json: boolean,
): Promise<void> {
  const result = await run("futures_get_positions", { instId });
  const positions = getData(result) as Record<string, unknown>[];
  if (json) return printJson(positions);
  const open = (positions ?? []).filter((p) => Number(p["pos"]) !== 0);
  if (!open.length) { outputLine("No open positions"); return; }
  printTable(
    open.map((p) => ({
      instId: p["instId"],
      side: p["posSide"],
      pos: p["pos"],
      avgPx: p["avgPx"],
      upl: p["upl"],
      lever: p["lever"],
    })),
  );
}

export async function cmdFuturesFills(
  run: ToolRunner,
  opts: { instId?: string; ordId?: string; archive: boolean; json: boolean },
): Promise<void> {
  const result = await run("futures_get_fills", { instId: opts.instId, ordId: opts.ordId, archive: opts.archive });
  const fills = getData(result) as Record<string, unknown>[];
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

export async function cmdFuturesPlace(
  run: ToolRunner,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    tdMode: string;
    tgtCcy?: string;
    posSide?: string;
    px?: string;
    reduceOnly?: boolean;
    clOrdId?: string;
    tpTriggerPx?: string;
    tpOrdPx?: string;
    slTriggerPx?: string;
    slOrdPx?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("futures_place_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
    tgtCcy: opts.tgtCcy,
    posSide: opts.posSide,
    px: opts.px,
    reduceOnly: opts.reduceOnly,
    clOrdId: opts.clOrdId,
    tpTriggerPx: opts.tpTriggerPx,
    tpOrdPx: opts.tpOrdPx,
    slTriggerPx: opts.slTriggerPx,
    slOrdPx: opts.slOrdPx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Order placed", "ordId");
}

export async function cmdFuturesCancel(
  run: ToolRunner,
  opts: { instId: string; ordId?: string; clOrdId?: string; json: boolean },
): Promise<void> {
  const { instId, ordId, clOrdId, json } = opts;
  if (!ordId && !clOrdId) throw new Error("Either --ordId or --clOrdId is required");
  const result = await run("futures_cancel_order", { instId, ...(ordId ? { ordId } : { clOrdId }) });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  emitWriteResult(data?.[0], "Cancelled", "ordId");
}

export async function cmdFuturesGet(
  run: ToolRunner,
  opts: { instId: string; ordId?: string; clOrdId?: string; json: boolean },
): Promise<void> {
  const result = await run("futures_get_order", { instId: opts.instId, ordId: opts.ordId, clOrdId: opts.clOrdId });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const o = data?.[0];
  if (!o) { outputLine("No data"); return; }
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

export async function cmdFuturesAmend(
  run: ToolRunner,
  opts: {
    instId: string;
    ordId?: string;
    clOrdId?: string;
    newSz?: string;
    newPx?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("futures_amend_order", {
    instId: opts.instId,
    ordId: opts.ordId,
    clOrdId: opts.clOrdId,
    newSz: opts.newSz,
    newPx: opts.newPx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Order amended", "ordId");
}

export async function cmdFuturesClose(
  run: ToolRunner,
  opts: { instId: string; mgnMode: string; posSide?: string; autoCxl?: boolean; json: boolean },
): Promise<void> {
  const result = await run("futures_close_position", {
    instId: opts.instId,
    mgnMode: opts.mgnMode,
    posSide: opts.posSide,
    autoCxl: opts.autoCxl,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  outputLine(`Position closed: ${r?.["instId"]} ${r?.["posSide"] ?? ""}`);
}

export async function cmdFuturesSetLeverage(
  run: ToolRunner,
  opts: { instId: string; lever: string; mgnMode: string; posSide?: string; json: boolean },
): Promise<void> {
  const result = await run("futures_set_leverage", {
    instId: opts.instId,
    lever: opts.lever,
    mgnMode: opts.mgnMode,
    posSide: opts.posSide,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  outputLine(`Leverage set: ${r?.["lever"]}x ${r?.["instId"]}`);
}

export async function cmdFuturesGetLeverage(
  run: ToolRunner,
  opts: { instId: string; mgnMode: string; json: boolean },
): Promise<void> {
  const result = await run("futures_get_leverage", { instId: opts.instId, mgnMode: opts.mgnMode });
  const data = getData(result) as Record<string, unknown>[];
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

export async function cmdFuturesBatch(
  run: ToolRunner,
  opts: { action: string; orders: string; json: boolean },
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(opts.orders);
  } catch {
    errorLine("Error: --orders must be a valid JSON array");
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    errorLine("Error: --orders must be a non-empty JSON array");
    process.exitCode = 1;
    return;
  }

  const toolMap: Record<string, string> = {
    place: "futures_batch_orders",
    amend: "futures_batch_amend",
    cancel: "futures_batch_cancel",
  };
  const tool = toolMap[opts.action];
  if (!tool) {
    errorLine("Error: --action must be one of: place, amend, cancel");
    process.exitCode = 1;
    return;
  }

  const result = await run(tool, { orders: parsed });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitBatchResults(data ?? []);
}

export async function cmdFuturesAlgoPlace(
  run: ToolRunner,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    posSide?: string;
    tdMode: string;
    clOrdId?: string;
    tgtCcy?: string;
    tpTriggerPx?: string;
    tpOrdPx?: string;
    slTriggerPx?: string;
    slOrdPx?: string;
    reduceOnly?: boolean;
    callbackRatio?: string;
    callbackSpread?: string;
    activePx?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("futures_place_algo_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
    clOrdId: opts.clOrdId,
    tgtCcy: opts.tgtCcy,
    posSide: opts.posSide,
    tpTriggerPx: opts.tpTriggerPx,
    tpOrdPx: opts.tpOrdPx,
    slTriggerPx: opts.slTriggerPx,
    slOrdPx: opts.slOrdPx,
    reduceOnly: opts.reduceOnly,
    callbackRatio: opts.callbackRatio,
    callbackSpread: opts.callbackSpread,
    activePx: opts.activePx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Algo order placed", "algoId");
}

export async function cmdFuturesAlgoTrailPlace(
  run: ToolRunner,
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
  const result = await run("futures_place_move_stop_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    sz: opts.sz,
    callbackRatio: opts.callbackRatio,
    callbackSpread: opts.callbackSpread,
    activePx: opts.activePx,
    posSide: opts.posSide,
    reduceOnly: opts.reduceOnly,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Trailing stop placed", "algoId");
}

export async function cmdFuturesAlgoAmend(
  run: ToolRunner,
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
  const result = await run("futures_amend_algo_order", {
    instId: opts.instId,
    algoId: opts.algoId,
    newSz: opts.newSz,
    newTpTriggerPx: opts.newTpTriggerPx,
    newTpOrdPx: opts.newTpOrdPx,
    newSlTriggerPx: opts.newSlTriggerPx,
    newSlOrdPx: opts.newSlOrdPx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Algo order amended", "algoId");
}

export async function cmdFuturesAlgoCancel(
  run: ToolRunner,
  instId: string,
  algoId: string,
  json: boolean,
): Promise<void> {
  const result = await run("futures_cancel_algo_orders", { orders: [{ instId, algoId }] });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  emitWriteResult(data?.[0], "Algo order cancelled", "algoId");
}

export async function cmdFuturesAlgoOrders(
  run: ToolRunner,
  opts: { instId?: string; status: "pending" | "history"; ordType?: string; json: boolean },
): Promise<void> {
  const result = await run("futures_get_algo_orders", {
    instId: opts.instId,
    status: opts.status,
    ordType: opts.ordType,
  });
  const orders = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(orders);
  if (!(orders ?? []).length) { outputLine("No algo orders"); return; }
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
