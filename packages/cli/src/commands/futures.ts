import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
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
  if (!open.length) { process.stdout.write("No open positions\n"); return; }
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
    posSide?: string;
    px?: string;
    reduceOnly?: boolean;
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
    posSide: opts.posSide,
    px: opts.px,
    reduceOnly: opts.reduceOnly,
    tpTriggerPx: opts.tpTriggerPx,
    tpOrdPx: opts.tpOrdPx,
    slTriggerPx: opts.slTriggerPx,
    slOrdPx: opts.slOrdPx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const order = data?.[0];
  process.stdout.write(`Order placed: ${order?.["ordId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`);
}

export async function cmdFuturesCancel(
  run: ToolRunner,
  instId: string,
  ordId: string,
  json: boolean,
): Promise<void> {
  const result = await run("futures_cancel_order", { instId, ordId });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(`Cancelled: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
}

export async function cmdFuturesGet(
  run: ToolRunner,
  opts: { instId: string; ordId?: string; json: boolean },
): Promise<void> {
  const result = await run("futures_get_order", { instId: opts.instId, ordId: opts.ordId });
  const data = getData(result) as Record<string, unknown>[];
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
  const r = data?.[0];
  process.stdout.write(`Order amended: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
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
  process.stdout.write(`Position closed: ${r?.["instId"]} ${r?.["posSide"] ?? ""}\n`);
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
  process.stdout.write(`Leverage set: ${r?.["lever"]}x ${r?.["instId"]}\n`);
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
    process.stderr.write("Error: --orders must be a valid JSON array\n");
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    process.stderr.write("Error: --orders must be a non-empty JSON array\n");
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
    process.stderr.write(`Error: --action must be one of: place, amend, cancel\n`);
    process.exitCode = 1;
    return;
  }

  const result = await run(tool, tool === "futures_batch_orders" ? { orders: parsed } : { orders: parsed });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  for (const r of data ?? []) {
    process.stdout.write(`${r["ordId"] ?? r["clOrdId"] ?? "?"}: ${r["sCode"] === "0" ? "OK" : r["sMsg"]}\n`);
  }
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
    tpTriggerPx?: string;
    tpOrdPx?: string;
    slTriggerPx?: string;
    slOrdPx?: string;
    reduceOnly?: boolean;
    json: boolean;
  },
): Promise<void> {
  const result = await run("futures_place_algo_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
    posSide: opts.posSide,
    tpTriggerPx: opts.tpTriggerPx,
    tpOrdPx: opts.tpOrdPx,
    slTriggerPx: opts.slTriggerPx,
    slOrdPx: opts.slOrdPx,
    reduceOnly: opts.reduceOnly,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const order = data?.[0];
  process.stdout.write(
    `Algo order placed: ${order?.["algoId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`,
  );
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
  const order = data?.[0];
  process.stdout.write(
    `Trailing stop placed: ${order?.["algoId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`,
  );
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
  const r = data?.[0];
  process.stdout.write(
    `Algo order amended: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
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
  const r = data?.[0];
  process.stdout.write(
    `Algo order cancelled: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
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
