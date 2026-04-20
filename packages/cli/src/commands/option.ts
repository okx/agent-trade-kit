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

export async function cmdOptionOrders(
  run: ToolRunner,
  opts: { instId?: string; uly?: string; status: "live" | "history" | "archive"; json: boolean },
): Promise<void> {
  const result = await run("option_get_orders", {
    instId: opts.instId,
    uly: opts.uly,
    status: opts.status,
  });
  const orders = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(orders);
  printTable(
    (orders ?? []).map((o) => ({
      ordId: o["ordId"],
      instId: o["instId"],
      side: o["side"],
      ordType: o["ordType"],
      px: o["px"],
      sz: o["sz"],
      state: o["state"],
    })),
  );
}

export async function cmdOptionGet(
  run: ToolRunner,
  opts: { instId: string; ordId?: string; clOrdId?: string; json: boolean },
): Promise<void> {
  const result = await run("option_get_order", {
    instId: opts.instId,
    ordId: opts.ordId,
    clOrdId: opts.clOrdId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const o = data?.[0];
  if (!o) { outputLine("No data"); return; }
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

export async function cmdOptionPositions(
  run: ToolRunner,
  opts: { instId?: string; uly?: string; json: boolean },
): Promise<void> {
  const result = await run("option_get_positions", {
    instId: opts.instId,
    uly: opts.uly,
  });
  const positions = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(positions);
  const open = (positions ?? []).filter((p) => Number(p["pos"]) !== 0);
  if (!open.length) { outputLine("No open positions"); return; }
  printTable(
    open.map((p) => ({
      instId: p["instId"],
      posSide: p["posSide"],
      pos: p["pos"],
      avgPx: p["avgPx"],
      upl: p["upl"],
      delta: p["deltaPA"],
      gamma: p["gammaPA"],
      theta: p["thetaPA"],
      vega: p["vegaPA"],
    })),
  );
}

export async function cmdOptionFills(
  run: ToolRunner,
  opts: { instId?: string; ordId?: string; archive: boolean; json: boolean },
): Promise<void> {
  const result = await run("option_get_fills", {
    instId: opts.instId,
    ordId: opts.ordId,
    archive: opts.archive,
  });
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

export async function cmdOptionInstruments(
  run: ToolRunner,
  opts: { uly: string; expTime?: string; json: boolean },
): Promise<void> {
  const result = await run("option_get_instruments", {
    uly: opts.uly,
    expTime: opts.expTime,
  });
  const instruments = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(instruments);
  printTable(
    (instruments ?? []).map((i) => ({
      instId: i["instId"],
      uly: i["uly"],
      expTime: i["expTime"],
      stk: i["stk"],
      optType: i["optType"],
      state: i["state"],
    })),
  );
}

export async function cmdOptionGreeks(
  run: ToolRunner,
  opts: { uly: string; expTime?: string; json: boolean },
): Promise<void> {
  const result = await run("option_get_greeks", {
    uly: opts.uly,
    expTime: opts.expTime,
  });
  const greeks = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(greeks);
  printTable(
    (greeks ?? []).map((g) => ({
      instId: g["instId"],
      delta: g["deltaBS"],
      gamma: g["gammaBS"],
      theta: g["thetaBS"],
      vega: g["vegaBS"],
      iv: g["markVol"],
      markPx: g["markPx"],
    })),
  );
}

export async function cmdOptionPlace(
  run: ToolRunner,
  opts: {
    instId: string;
    tdMode: string;
    side: string;
    ordType: string;
    sz: string;
    tgtCcy?: string;
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
  const result = await run("option_place_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
    tgtCcy: opts.tgtCcy,
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

export async function cmdOptionCancel(
  run: ToolRunner,
  opts: { instId: string; ordId?: string; clOrdId?: string; json: boolean },
): Promise<void> {
  const result = await run("option_cancel_order", {
    instId: opts.instId,
    ordId: opts.ordId,
    clOrdId: opts.clOrdId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Cancelled", "ordId");
}

export async function cmdOptionAmend(
  run: ToolRunner,
  opts: { instId: string; ordId?: string; clOrdId?: string; newSz?: string; newPx?: string; json: boolean },
): Promise<void> {
  const result = await run("option_amend_order", {
    instId: opts.instId,
    ordId: opts.ordId,
    clOrdId: opts.clOrdId,
    newSz: opts.newSz,
    newPx: opts.newPx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Amended", "ordId");
}

export async function cmdOptionBatchCancel(
  run: ToolRunner,
  opts: { orders: string; json: boolean },
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
  const result = await run("option_batch_cancel", { orders: parsed });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitBatchResults(data ?? []);
}

export async function cmdOptionAlgoPlace(
  run: ToolRunner,
  opts: {
    instId: string;
    tdMode: string;
    side: string;
    ordType: string;
    sz: string;
    tgtCcy?: string;
    tpTriggerPx?: string;
    tpOrdPx?: string;
    slTriggerPx?: string;
    slOrdPx?: string;
    reduceOnly?: boolean;
    clOrdId?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("option_place_algo_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
    tgtCcy: opts.tgtCcy,
    tpTriggerPx: opts.tpTriggerPx,
    tpOrdPx: opts.tpOrdPx,
    slTriggerPx: opts.slTriggerPx,
    slOrdPx: opts.slOrdPx,
    reduceOnly: opts.reduceOnly,
    clOrdId: opts.clOrdId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Algo order placed", "algoId");
}

export async function cmdOptionAlgoAmend(
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
  const result = await run("option_amend_algo_order", {
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

export async function cmdOptionAlgoCancel(
  run: ToolRunner,
  opts: { instId: string; algoId: string; json: boolean },
): Promise<void> {
  const result = await run("option_cancel_algo_orders", { orders: [{ instId: opts.instId, algoId: opts.algoId }] });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "Algo order cancelled", "algoId");
}

export async function cmdOptionAlgoOrders(
  run: ToolRunner,
  opts: { instId?: string; status: "pending" | "history"; ordType?: string; json: boolean },
): Promise<void> {
  const result = await run("option_get_algo_orders", {
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
