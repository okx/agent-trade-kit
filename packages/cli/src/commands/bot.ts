import type { ToolRunner } from "@agent-tradekit/core";
import { outputLine, errorLine, printJson, printKv, printTable } from "../formatter.js";

function emitWriteResult(item: Record<string, unknown> | undefined, label: string, idKey: string): void {
  const isError = item?.["sCode"] !== "0" && item?.["sCode"] !== 0;
  if (isError) {
    errorLine(`Error: ${item?.["sMsg"]} (sCode ${item?.["sCode"]})`);
  } else {
    outputLine(`${label}: ${item?.[idKey]} (OK)`);
  }
}

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
  if (!orders.length) { outputLine("No grid bots"); return; }
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
  if (!detail) { outputLine("Bot not found"); return; }
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
  if (!orders.length) { outputLine("No sub-orders"); return; }
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
    tpRatio?: string;
    slRatio?: string;
    algoClOrdId?: string;
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
    tpRatio: opts.tpRatio,
    slRatio: opts.slRatio,
    algoClOrdId: opts.algoClOrdId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  emitWriteResult(data?.[0], "Grid bot created", "algoId");
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
  emitWriteResult(data?.[0], "Grid bot stopped", "algoId");
}

// ---------------------------------------------------------------------------
// DCA (Spot & Contract) commands
// ---------------------------------------------------------------------------

export async function cmdDcaCreate(
  run: ToolRunner,
  opts: {
    instId: string;
    algoOrdType: string;
    lever?: string;
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
    triggerCond?: string;
    thold?: string;
    timeframe?: string;
    timePeriod?: string;
    algoClOrdId?: string;
    reserveFunds?: string;
    tradeQuoteCcy?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("dca_create_order", {
    instId: opts.instId,
    algoOrdType: opts.algoOrdType,
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
    triggerCond: opts.triggerCond,
    thold: opts.thold,
    timeframe: opts.timeframe,
    timePeriod: opts.timePeriod,
    algoClOrdId: opts.algoClOrdId,
    reserveFunds: opts.reserveFunds,
    tradeQuoteCcy: opts.tradeQuoteCcy,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "DCA bot created", "algoId");
}

export async function cmdDcaStop(
  run: ToolRunner,
  opts: { algoId: string; algoOrdType: string; stopType?: string; json: boolean },
): Promise<void> {
  const result = await run("dca_stop_order", {
    algoId: opts.algoId,
    algoOrdType: opts.algoOrdType,
    stopType: opts.stopType,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  emitWriteResult(data?.[0], "DCA bot stopped", "algoId");
}

export async function cmdDcaOrders(
  run: ToolRunner,
  opts: { algoOrdType?: string; algoId?: string; instId?: string; history: boolean; json: boolean },
): Promise<void> {
  const result = await run("dca_get_orders", {
    status: opts.history ? "history" : "active",
    algoOrdType: opts.algoOrdType,
    algoId: opts.algoId,
    instId: opts.instId,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { outputLine("No DCA bots"); return; }
  printTable(
    orders.map((o) => ({
      algoId:      o["algoId"],
      instId:      o["instId"],
      type:        o["algoOrdType"],
      state:       o["state"],
      pnl:         o["pnl"],
      pnlRatio:    o["pnlRatio"],
      createdAt:   new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

export async function cmdDcaDetails(
  run: ToolRunner,
  opts: { algoId: string; algoOrdType: string; json: boolean },
): Promise<void> {
  const result = await run("dca_get_order_details", {
    algoId: opts.algoId,
    algoOrdType: opts.algoOrdType,
  });
  const detail = ((getData(result) as Record<string, unknown>[]) ?? [])[0];
  if (!detail) { outputLine("DCA bot not found"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:        detail["algoId"],
    algoOrdType:   detail["algoOrdType"],
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
  opts: { algoId: string; algoOrdType: string; cycleId?: string; json: boolean },
): Promise<void> {
  const result = await run("dca_get_sub_orders", {
    algoId: opts.algoId,
    algoOrdType: opts.algoOrdType,
    cycleId: opts.cycleId,
  });
  const rows = (getData(result) as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(rows);
  if (!rows.length) { outputLine("No sub-orders"); return; }

  if (opts.cycleId) {
    // Orders within a cycle — fields from /orders endpoint
    printTable(
      rows.map((o) => ({
        ordId:     o["ordId"],
        side:      o["side"],
        ordType:   o["ordType"],
        px:        o["px"],
        filledSz:  o["filledSz"],
        avgFillPx: o["avgFillPx"],
        state:     o["state"],
        fee:       o["fee"],
      })),
    );
  } else {
    // Cycle list — fields from /cycle-list endpoint
    printTable(
      rows.map((o) => ({
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
}
