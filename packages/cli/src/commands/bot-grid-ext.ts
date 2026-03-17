/**
 * Extended grid trading CLI commands.
 *
 * These commands call OkxRestClient directly (no ToolSpec).
 * They cover the 15 grid OpenAPIs not yet implemented as tools.
 */
import type { OkxRestClient } from "@agent-tradekit/core";
import { privateRateLimit, publicRateLimit, compactObject } from "@agent-tradekit/core";
import { printJson, printKv } from "../formatter.js";

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
// #2  Grid Amend Basic Param
// POST /api/v5/tradingBot/grid/amend-algo-basic-param
// ---------------------------------------------------------------------------

export async function cmdGridAmendBasicParam(
  client: OkxRestClient,
  opts: {
    algoId: string;
    minPx: string;
    maxPx: string;
    gridNum: string;
    topupAmount?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/amend-algo-basic-param",
    compactObject({
      algoId: opts.algoId,
      minPx: opts.minPx,
      maxPx: opts.maxPx,
      gridNum: opts.gridNum,
      topupAmount: opts.topupAmount,
    }),
    privateRateLimit("grid_amend_basic_param", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `Grid bot amended: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #3  Grid Amend Order
// POST /api/v5/tradingBot/grid/amend-order-algo
// ---------------------------------------------------------------------------

export async function cmdGridAmendOrder(
  client: OkxRestClient,
  opts: {
    algoId: string;
    instId: string;
    slTriggerPx?: string;
    tpTriggerPx?: string;
    tpRatio?: string;
    slRatio?: string;
    topUpAmt?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/amend-order-algo",
    compactObject({
      algoId: opts.algoId,
      instId: opts.instId,
      slTriggerPx: opts.slTriggerPx,
      tpTriggerPx: opts.tpTriggerPx,
      tpRatio: opts.tpRatio,
      slRatio: opts.slRatio,
      topUpAmt: opts.topUpAmt,
    }),
    privateRateLimit("grid_amend_order", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `Grid bot order amended: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #5  Grid Close Position
// POST /api/v5/tradingBot/grid/close-position
// ---------------------------------------------------------------------------

export async function cmdGridClosePosition(
  client: OkxRestClient,
  opts: {
    algoId: string;
    mktClose: boolean;
    sz?: string;
    px?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/close-position",
    compactObject({
      algoId: opts.algoId,
      mktClose: opts.mktClose,
      sz: opts.sz,
      px: opts.px,
    }),
    privateRateLimit("grid_close_position", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const r = data[0];
  if (opts.mktClose) {
    printWriteResult(data, `Grid position market closed: ${r?.["algoId"]}`);
  } else {
    printWriteResult(data, `Grid close order placed: ${r?.["algoId"]} ordId=${r?.["ordId"]}`);
  }
}

// ---------------------------------------------------------------------------
// #6  Grid Cancel Close Order
// POST /api/v5/tradingBot/grid/cancel-close-order
// ---------------------------------------------------------------------------

export async function cmdGridCancelCloseOrder(
  client: OkxRestClient,
  opts: {
    algoId: string;
    ordId: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/cancel-close-order",
    { algoId: opts.algoId, ordId: opts.ordId },
    privateRateLimit("grid_cancel_close_order", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `Grid close order cancelled: ${data[0]?.["algoId"]} ordId=${data[0]?.["ordId"]}`);
}

// ---------------------------------------------------------------------------
// #7  Grid Instant Trigger
// POST /api/v5/tradingBot/grid/order-instant-trigger
// ---------------------------------------------------------------------------

export async function cmdGridInstantTrigger(
  client: OkxRestClient,
  opts: {
    algoId: string;
    topUpAmt?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/order-instant-trigger",
    compactObject({
      algoId: opts.algoId,
      topUpAmt: opts.topUpAmt,
    }),
    privateRateLimit("grid_instant_trigger", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `Grid bot triggered: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #12  Grid Get Positions
// GET /api/v5/tradingBot/grid/positions
// ---------------------------------------------------------------------------

export async function cmdGridPositions(
  client: OkxRestClient,
  opts: {
    algoOrdType: string;
    algoId: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privateGet(
    "/api/v5/tradingBot/grid/positions",
    { algoOrdType: opts.algoOrdType, algoId: opts.algoId },
    privateRateLimit("grid_positions", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const detail = data[0];
  if (!detail) {
    process.stdout.write("No position data\n");
    return;
  }
  printKv({
    algoId:   detail["algoId"],
    instId:   detail["instId"],
    pos:      detail["pos"],
    avgPx:    detail["avgPx"],
    liqPx:    detail["liqPx"],
    lever:    detail["lever"],
    mgnMode:  detail["mgnMode"],
    upl:      detail["upl"],
    uplRatio: detail["uplRatio"],
    markPx:   detail["markPx"],
  });
}

// ---------------------------------------------------------------------------
// #13  Grid Withdraw Income
// POST /api/v5/tradingBot/grid/withdraw-income
// ---------------------------------------------------------------------------

export async function cmdGridWithdrawIncome(
  client: OkxRestClient,
  opts: {
    algoId: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/withdraw-income",
    { algoId: opts.algoId },
    privateRateLimit("grid_withdraw_income", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const r = data[0];
  process.stdout.write(`Grid income withdrawn: ${r?.["algoId"]} profit=${r?.["profit"]}\n`);
}

// ---------------------------------------------------------------------------
// #14  Grid Compute Margin Balance
// POST /api/v5/tradingBot/grid/compute-margin-balance
// ---------------------------------------------------------------------------

export async function cmdGridComputeMarginBalance(
  client: OkxRestClient,
  opts: {
    algoId: string;
    type: string;
    amt?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/compute-margin-balance",
    compactObject({
      algoId: opts.algoId,
      type: opts.type,
      amt: opts.amt,
    }),
    privateRateLimit("grid_compute_margin_balance", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const detail = data[0];
  if (!detail) {
    process.stdout.write("No data\n");
    return;
  }
  printKv({
    maxAmt: detail["maxAmt"],
    lever:  detail["lever"],
  });
}

// ---------------------------------------------------------------------------
// #15  Grid Margin Balance
// POST /api/v5/tradingBot/grid/margin-balance
// ---------------------------------------------------------------------------

export async function cmdGridMarginBalance(
  client: OkxRestClient,
  opts: {
    algoId: string;
    type: string;
    amt?: string;
    percent?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/margin-balance",
    compactObject({
      algoId: opts.algoId,
      type: opts.type,
      amt: opts.amt,
      percent: opts.percent,
    }),
    privateRateLimit("grid_margin_balance", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `Grid margin adjusted: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #16  Grid Adjust Investment
// POST /api/v5/tradingBot/grid/adjust-investment
// ---------------------------------------------------------------------------

export async function cmdGridAdjustInvestment(
  client: OkxRestClient,
  opts: {
    algoId: string;
    amt: string;
    allowReinvestProfit?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.privatePost(
    "/api/v5/tradingBot/grid/adjust-investment",
    compactObject({
      algoId: opts.algoId,
      amt: opts.amt,
      allowReinvestProfit: opts.allowReinvestProfit,
    }),
    privateRateLimit("grid_adjust_investment", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `Grid investment adjusted: ${data[0]?.["algoId"]}`);
}

// ---------------------------------------------------------------------------
// #17  Grid AI Param (Public)
// GET /api/v5/tradingBot/grid/ai-param
// ---------------------------------------------------------------------------

export async function cmdGridAiParam(
  client: OkxRestClient,
  opts: {
    algoOrdType: string;
    instId: string;
    direction?: string;
    duration?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.publicGet(
    "/api/v5/tradingBot/grid/ai-param",
    compactObject({
      algoOrdType: opts.algoOrdType,
      instId: opts.instId,
      direction: opts.direction,
      duration: opts.duration,
    }),
    publicRateLimit("grid_ai_param", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const detail = data[0];
  if (!detail) {
    process.stdout.write("No AI param data\n");
    return;
  }
  printKv({
    instId:         detail["instId"],
    algoOrdType:    detail["algoOrdType"],
    duration:       detail["duration"],
    gridNum:        detail["gridNum"],
    maxPx:          detail["maxPx"],
    minPx:          detail["minPx"],
    minInvestment:  `${detail["minInvestment"]} ${detail["ccy"]}`,
    annualizedRate: detail["annualizedRate"],
    runType:        detail["runType"] === "1" ? "arithmetic" : "geometric",
  });
}

// ---------------------------------------------------------------------------
// #18  Grid Min Investment (Public)
// POST /api/v5/tradingBot/grid/min-investment
// ---------------------------------------------------------------------------

export async function cmdGridMinInvestment(
  client: OkxRestClient,
  opts: {
    instId: string;
    algoOrdType: string;
    gridNum: string;
    maxPx: string;
    minPx: string;
    runType: string;
    direction?: string;
    lever?: string;
    basePos?: boolean;
    investmentType?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.publicPost(
    "/api/v5/tradingBot/grid/min-investment",
    compactObject({
      instId: opts.instId,
      algoOrdType: opts.algoOrdType,
      gridNum: opts.gridNum,
      maxPx: opts.maxPx,
      minPx: opts.minPx,
      runType: opts.runType,
      direction: opts.direction,
      lever: opts.lever,
      basePos: opts.basePos,
      investmentType: opts.investmentType,
    }),
    publicRateLimit("grid_min_investment", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const detail = data[0];
  if (!detail) {
    process.stdout.write("No data\n");
    return;
  }
  const minData = detail["minInvestmentData"] as Record<string, string>[] | undefined;
  if (minData && minData.length > 0) {
    process.stdout.write("Min Investment:\n");
    for (const item of minData) {
      process.stdout.write(`  ${item["amt"]} ${item["ccy"]}\n`);
    }
  }
  process.stdout.write(`Single Amount: ${detail["singleAmt"]}\n`);
}

// ---------------------------------------------------------------------------
// #19  RSI Back Testing (Public)
// GET /api/v5/tradingBot/public/rsi-back-testing
// ---------------------------------------------------------------------------

export async function cmdGridRsiBackTesting(
  client: OkxRestClient,
  opts: {
    instId: string;
    timeframe: string;
    thold: string;
    timePeriod: string;
    triggerCond?: string;
    duration?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.publicGet(
    "/api/v5/tradingBot/public/rsi-back-testing",
    compactObject({
      instId: opts.instId,
      timeframe: opts.timeframe,
      thold: opts.thold,
      timePeriod: opts.timePeriod,
      triggerCond: opts.triggerCond,
      duration: opts.duration,
    }),
    publicRateLimit("grid_rsi_back_testing", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const detail = data[0];
  process.stdout.write(`RSI trigger count: ${detail?.["triggerNum"] ?? "N/A"}\n`);
}

// ---------------------------------------------------------------------------
// #20  Grid Max Quantity (Public)
// GET /api/v5/tradingBot/grid/grid-quantity
// ---------------------------------------------------------------------------

export async function cmdGridMaxQuantity(
  client: OkxRestClient,
  opts: {
    instId: string;
    runType: string;
    algoOrdType: string;
    maxPx: string;
    minPx: string;
    lever?: string;
    json: boolean;
  },
): Promise<void> {
  const response = await client.publicGet(
    "/api/v5/tradingBot/grid/grid-quantity",
    compactObject({
      instId: opts.instId,
      runType: opts.runType,
      algoOrdType: opts.algoOrdType,
      maxPx: opts.maxPx,
      minPx: opts.minPx,
      lever: opts.lever,
    }),
    publicRateLimit("grid_max_quantity", 5),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const detail = data[0];
  process.stdout.write(`Max grid quantity: ${detail?.["maxGridQty"] ?? "N/A"} (min: 2)\n`);
}
