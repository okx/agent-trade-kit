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
// DCA (Spot) commands
// ---------------------------------------------------------------------------

export async function cmdDcaCreate(
  run: ToolRunner,
  opts: {
    type: string;
    instId: string;
    initOrdAmt: string;
    safetyOrdAmt: string;
    maxSafetyOrds: string;
    pxSteps: string;
    pxStepsMult: string;
    volMult: string;
    tpPct: string;
    slPct?: string;
    reserveFunds?: string;
    triggerType?: string;
    direction?: string;
    lever?: string;
    side?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("dca_create_order", {
    type: opts.type,
    instId: opts.instId,
    initOrdAmt: opts.initOrdAmt,
    safetyOrdAmt: opts.safetyOrdAmt,
    maxSafetyOrds: opts.maxSafetyOrds,
    pxSteps: opts.pxSteps,
    pxStepsMult: opts.pxStepsMult,
    volMult: opts.volMult,
    tpPct: opts.tpPct,
    slPct: opts.slPct,
    reserveFunds: opts.reserveFunds,
    triggerType: opts.triggerType,
    direction: opts.direction,
    lever: opts.lever,
    side: opts.side,
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
  opts: { type: string; algoId: string; instId: string; stopType?: string; json: boolean },
): Promise<void> {
  const result = await run("dca_stop_order", {
    type: opts.type,
    algoId: opts.algoId,
    instId: opts.instId,
    stopType: opts.stopType,
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
  opts: { type: string; history: boolean; json: boolean },
): Promise<void> {
  const result = await run("dca_get_orders", {
    type: opts.type,
    status: opts.history ? "history" : "active",
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
  opts: { type: string; algoId: string; json: boolean },
): Promise<void> {
  const result = await run("dca_get_order_details", {
    type: opts.type,
    algoId: opts.algoId,
  });
  const detail = ((getData(result) as Record<string, unknown>[]) ?? [])[0];
  if (!detail) { process.stdout.write("DCA bot not found\n"); return; }
  if (opts.json) return printJson(detail);
  if (opts.type === "contract") {
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
  } else {
    printKv({
      algoId:       detail["algoId"],
      instId:       detail["instId"],
      state:        detail["state"],
      initOrdAmt:   detail["initOrdAmt"],
      safetyOrdAmt: detail["safetyOrdAmt"],
      maxSafetyOrds: detail["maxSafetyOrds"],
      tpPct:        detail["tpPct"],
      slPct:        detail["slPct"],
      pnl:          detail["pnl"],
      pnlRatio:     detail["pnlRatio"],
      createdAt:    new Date(Number(detail["cTime"])).toLocaleString(),
    });
  }
}

export async function cmdDcaSubOrders(
  run: ToolRunner,
  opts: { type: string; algoId: string; live: boolean; cycleId?: string; json: boolean },
): Promise<void> {
  const result = await run("dca_get_sub_orders", {
    type: opts.type,
    algoId: opts.algoId,
    subOrdType: opts.type === "contract" ? undefined : (opts.live ? "live" : "filled"),
    cycleId: opts.type === "contract" ? opts.cycleId : undefined,
  });
  const orders = (getData(result) as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No sub-orders\n"); return; }
  if (opts.type === "contract") {
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
  } else {
    printTable(
      orders.map((o) => ({
        ordId:  o["ordId"],
        side:   o["side"],
        px:     o["px"],
        sz:     o["sz"],
        fillPx: o["fillPx"],
        fillSz: o["fillSz"],
        state:  o["state"],
        fee:    o["fee"],
      })),
    );
  }
}
