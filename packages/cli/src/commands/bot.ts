import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printTable, printKv } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

export async function cmdGridOrders(
  run: ToolRunner,
  opts: {
    algoOrdType: string;
    instId?: string;
    algoId?: string;
    status: "active" | "history";
    json: boolean;
  },
): Promise<void> {
  const result = await run("grid_get_orders", {
    algoOrdType: opts.algoOrdType,
    instId: opts.instId,
    algoId: opts.algoId,
    status: opts.status,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
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

export async function cmdGridDetails(
  run: ToolRunner,
  opts: { algoOrdType: string; algoId: string; json: boolean },
): Promise<void> {
  const result = await run("grid_get_order_details", {
    algoOrdType: opts.algoOrdType,
    algoId: opts.algoId,
  });
  const detail = ((getData(result) as Record<string, unknown>[]) ?? [])[0];
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
    pnl:          detail["totalPnl"],
    pnlRatio:     detail["pnlRatio"],
    investAmt:    detail["investment"],
    totalAnnRate: detail["totalAnnualizedRate"],
    createdAt:    new Date(Number(detail["cTime"])).toLocaleString(),
  });
}

export async function cmdGridSubOrders(
  run: ToolRunner,
  opts: {
    algoOrdType: string;
    algoId: string;
    type: "filled" | "live";
    json: boolean;
  },
): Promise<void> {
  const result = await run("grid_get_sub_orders", {
    algoOrdType: opts.algoOrdType,
    algoId: opts.algoId,
    type: opts.type,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
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

export async function cmdGridCreate(
  run: ToolRunner,
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
    basePos?: boolean;
    tpTriggerPx?: string;
    slTriggerPx?: string;
    algoClOrdId?: string;
    tpRatio?: string;
    slRatio?: string;
    tradeQuoteCcy?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("grid_create_order", {
    instId: opts.instId,
    algoOrdType: opts.algoOrdType,
    maxPx: opts.maxPx,
    minPx: opts.minPx,
    gridNum: opts.gridNum,
    runType: opts.runType,
    quoteSz: opts.quoteSz,
    baseSz: opts.baseSz,
    direction: opts.direction,
    lever: opts.lever,
    sz: opts.sz,
    basePos: opts.basePos,
    tpTriggerPx: opts.tpTriggerPx,
    slTriggerPx: opts.slTriggerPx,
    algoClOrdId: opts.algoClOrdId,
    tpRatio: opts.tpRatio,
    slRatio: opts.slRatio,
    tradeQuoteCcy: opts.tradeQuoteCcy,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `Grid bot created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdGridStop(
  run: ToolRunner,
  opts: {
    algoId: string;
    algoOrdType: string;
    instId: string;
    stopType?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("grid_stop_order", {
    algoId: opts.algoId,
    algoOrdType: opts.algoOrdType,
    instId: opts.instId,
    stopType: opts.stopType,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `Grid bot stopped: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

// ---------------------------------------------------------------------------
// DCA (Contract) commands
// ---------------------------------------------------------------------------

export async function cmdDcaCreate(
  run: ToolRunner,
  opts: {
    instId: string;
    lever: string;
    direction: string;
    initOrdAmt: string;
    maxSafetyOrds: string;
    tpPct: string;
    safetyOrdAmt?: string;
    pxSteps?: string;
    pxStepsMult?: string;
    volMult?: string;
    slPct?: string;
    slMode?: string;
    allowReinvest?: string;
    triggerStrategy?: string;
    triggerPx?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("dca_create_order", {
    instId: opts.instId,
    lever: opts.lever,
    direction: opts.direction,
    initOrdAmt: opts.initOrdAmt,
    maxSafetyOrds: opts.maxSafetyOrds,
    tpPct: opts.tpPct,
    safetyOrdAmt: opts.safetyOrdAmt,
    pxSteps: opts.pxSteps,
    pxStepsMult: opts.pxStepsMult,
    volMult: opts.volMult,
    slPct: opts.slPct,
    slMode: opts.slMode,
    allowReinvest: opts.allowReinvest,
    triggerStrategy: opts.triggerStrategy,
    triggerPx: opts.triggerPx,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `DCA bot created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdDcaStop(
  run: ToolRunner,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const result = await run("dca_stop_order", {
    algoId: opts.algoId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `DCA bot stopped: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdDcaOrders(
  run: ToolRunner,
  opts: { algoId?: string; instId?: string; history: boolean; json: boolean },
): Promise<void> {
  const result = await run("dca_get_orders", {
    status: opts.history ? "history" : "active",
    algoId: opts.algoId,
    instId: opts.instId,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No DCA bots\n"); return; }
  printTable(
    orders.map((o) => ({
      algoId:    o["algoId"],
      instId:    o["instId"],
      state:     o["state"],
      pnl:       o["pnl"],
      pnlRatio:  o["pnlRatio"],
      createdAt: new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

export async function cmdDcaDetails(
  run: ToolRunner,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const result = await run("dca_get_order_details", {
    algoId: opts.algoId,
  });
  const detail = ((getData(result) as Record<string, unknown>[]) ?? [])[0];
  if (!detail) { process.stdout.write("DCA bot not found\n"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:        detail["algoId"],
    instId:        detail["instId"],
    sz:            detail["sz"],
    avgPx:         detail["avgPx"],
    initPx:        detail["initPx"],
    tpPx:          detail["tpPx"],
    slPx:          detail["slPx"] || "-",
    upl:           detail["upl"],
    fee:           detail["fee"],
    fundingFee:    detail["fundingFee"],
    curCycleId:    detail["curCycleId"],
    fillSafetyOrds: detail["fillSafetyOrds"],
    createdAt:     new Date(Number(detail["startTime"])).toLocaleString(),
  });
}

export async function cmdDcaSubOrders(
  run: ToolRunner,
  opts: { algoId: string; cycleId?: string; json: boolean },
): Promise<void> {
  const result = await run("dca_get_sub_orders", {
    algoId: opts.algoId,
    cycleId: opts.cycleId,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No sub-orders\n"); return; }
  printTable(
    orders.map((o) => ({
      cycleId:     o["cycleId"],
      status:      o["cycleStatus"],
      current:     o["currentCycle"] ? "yes" : "",
      avgPx:       o["avgPx"],
      tpPx:        o["tpPx"],
      realizedPnl: o["realizedPnl"],
      fee:         o["fee"],
      startTime:   o["startTime"] ? new Date(Number(o["startTime"] as string)).toLocaleString() : "",
    })),
  );
}

// ---------------------------------------------------------------------------
// TWAP commands
// ---------------------------------------------------------------------------

export async function cmdTwapPlace(
  run: ToolRunner,
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
  const result = await run("twap_place_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    sz: opts.sz,
    szLimit: opts.szLimit,
    pxLimit: opts.pxLimit,
    timeInterval: opts.timeInterval,
    posSide: opts.posSide,
    pxVar: opts.pxVar,
    pxSpread: opts.pxSpread,
    algoClOrdId: opts.algoClOrdId,
    ccy: opts.ccy,
    tradeQuoteCcy: opts.tradeQuoteCcy,
    reduceOnly: opts.reduceOnly,
    isTradeBorrowMode: opts.isTradeBorrowMode,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `TWAP order placed: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdTwapCancel(
  run: ToolRunner,
  opts: { instId: string; algoId?: string; algoClOrdId?: string; json: boolean },
): Promise<void> {
  const result = await run("twap_cancel_order", {
    instId: opts.instId,
    algoId: opts.algoId,
    algoClOrdId: opts.algoClOrdId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `TWAP order cancelled: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdTwapOrders(
  run: ToolRunner,
  opts: { history: boolean; instId?: string; instType?: string; state?: string; json: boolean },
): Promise<void> {
  const result = await run("twap_get_orders", {
    status: opts.history ? "history" : "active",
    instId: opts.instId,
    instType: opts.instType,
    state: opts.state,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No TWAP orders\n"); return; }
  printTable(
    orders.map((o) => ({
      algoId:      o["algoId"],
      instId:      o["instId"],
      side:        o["side"],
      state:       o["state"],
      sz:          o["sz"],
      szLimit:     o["szLimit"],
      pxLimit:     o["pxLimit"],
      timeInterval: o["timeInterval"],
      createdAt:   new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

export async function cmdTwapDetails(
  run: ToolRunner,
  opts: { algoId?: string; algoClOrdId?: string; json: boolean },
): Promise<void> {
  const result = await run("twap_get_order_details", {
    algoId: opts.algoId,
    algoClOrdId: opts.algoClOrdId,
  });
  const detail = ((getData(result) as Record<string, unknown>[]) ?? [])[0];
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
