import type { OkxRestClient } from "@agent-tradekit/core";
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

// ─── spot dca ─────────────────────────────────────────────────────────────────

export async function cmdDcaCreate(
  client: OkxRestClient,
  opts: {
    instId: string; initOrdAmt: string; safetyOrdAmt: string;
    maxSafetyOrds: string; pxSteps: string; pxStepsMult: string;
    volMult: string; tpPct: string; slPct: string;
    reserveFunds?: string; triggerType?: string; direction?: string;
    json: boolean;
  },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/dca/order-algo", {
    instId:        opts.instId,
    initOrdAmt:    opts.initOrdAmt,
    safetyOrdAmt:  opts.safetyOrdAmt,
    maxSafetyOrds: opts.maxSafetyOrds,
    pxSteps:       opts.pxSteps,
    pxStepsMult:   opts.pxStepsMult,
    volMult:       opts.volMult,
    tpPct:         opts.tpPct,
    slPct:         opts.slPct,
    reserveFunds:  opts.reserveFunds ?? "false",
    triggerType:   opts.triggerType ?? "1",
    direction:     opts.direction ?? "long",
  });
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `DCA bot created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdDcaStop(
  client: OkxRestClient,
  opts: { algoId: string; instId: string; stopType: string; json: boolean },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/dca/stop-order-algo", [
    { algoId: opts.algoId, instId: opts.instId, algoOrdType: "spot_dca", stopType: opts.stopType },
  ]);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `DCA bot stopped: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdDcaOrders(
  client: OkxRestClient,
  opts: { history: boolean; json: boolean },
): Promise<void> {
  const path = opts.history
    ? "/api/v5/tradingBot/dca/orders-algo-history"
    : "/api/v5/tradingBot/dca/orders-algo-pending";
  const res = await client.privateGet(path, {});
  const bots = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(bots);
  if (!bots.length) { process.stdout.write("No DCA bots\n"); return; }
  printTable(
    bots.map((o) => ({
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
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/dca/orders-algo-details", {
    algoId: opts.algoId,
  });
  const detail = ((res.data as Record<string, unknown>[]) ?? [])[0];
  if (!detail) { process.stdout.write("Bot not found\n"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:        detail["algoId"],
    instId:        detail["instId"],
    state:         detail["state"],
    initOrdAmt:    detail["initOrdAmt"],
    safetyOrdAmt:  detail["safetyOrdAmt"],
    maxSafetyOrds: detail["maxSafetyOrds"],
    tpPct:         detail["tpPct"],
    slPct:         detail["slPct"],
    pnl:           detail["pnl"],
    pnlRatio:      detail["pnlRatio"],
    createdAt:     new Date(Number(detail["cTime"])).toLocaleString(),
  });
}

export async function cmdDcaSubOrders(
  client: OkxRestClient,
  opts: { algoId: string; live: boolean; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/dca/sub-orders", {
    algoId: opts.algoId,
    type:   opts.live ? "0" : "1",
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

export async function cmdDcaAiParam(
  client: OkxRestClient,
  opts: { instId: string; userRiskMode: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/dca/ai-param", {
    instId:       opts.instId,
    userRiskMode: opts.userRiskMode,
  });
  if (opts.json) return printJson(res.data);
  const d = ((res.data as Record<string, unknown>[]) ?? [])[0];
  if (!d) { process.stdout.write("No data\n"); return; }
  printKv(d);
}

// ─── contract dca ─────────────────────────────────────────────────────────────

export async function cmdContractDcaCreate(
  client: OkxRestClient,
  opts: {
    instId: string; lever: string; side: string; initOrdAmt: string;
    safetyOrdAmt: string; maxSafetyOrds: string; pxSteps: string;
    pxStepsMult: string; volMult: string; tpPct: string;
    direction?: string; reserveFunds?: string; json: boolean;
  },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/dca/create", {
    instId:        opts.instId,
    algoOrdType:   "contract_dca",
    lever:         opts.lever,
    side:          opts.side,
    direction:     opts.direction ?? "long",
    initOrdAmt:    opts.initOrdAmt,
    safetyOrdAmt:  opts.safetyOrdAmt,
    maxSafetyOrds: opts.maxSafetyOrds,
    pxSteps:       opts.pxSteps,
    pxStepsMult:   opts.pxStepsMult,
    volMult:       opts.volMult,
    tpPct:         opts.tpPct,
    reserveFunds:  opts.reserveFunds ?? "false",
    triggerParams: [{ triggerAction: "start", triggerStrategy: "instant" }],
  });
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Contract DCA bot created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdContractDcaStop(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/dca/stop", {
    algoId:      opts.algoId,
    algoOrdType: "contract_dca",
  });
  if (opts.json) return printJson(res.data);
  process.stdout.write(`Contract DCA bot stopped: ${opts.algoId}\n`);
}

export async function cmdContractDcaManualBuy(
  client: OkxRestClient,
  opts: { algoId: string; amt: string; px?: string; json: boolean },
): Promise<void> {
  const body: Record<string, unknown> = {
    algoId:      opts.algoId,
    algoOrdType: "contract_dca",
    amt:         opts.amt,
  };
  if (opts.px) body["price"] = opts.px;
  const res = await client.privatePost("/api/v5/tradingBot/dca/orders/manual-buy", body);
  if (opts.json) return printJson(res.data);
  process.stdout.write(`Manual buy triggered for: ${opts.algoId}\n`);
}

export async function cmdContractDcaMargin(
  client: OkxRestClient,
  opts: { algoId: string; amt: string; action: "add" | "reduce"; json: boolean },
): Promise<void> {
  const res = await client.privatePost(`/api/v5/tradingBot/dca/margin/${opts.action}`, {
    algoId: opts.algoId,
    amt:    opts.amt,
  });
  if (opts.json) return printJson(res.data);
  process.stdout.write(`Margin ${opts.action} for ${opts.algoId}: done\n`);
}

export async function cmdContractDcaSetTp(
  client: OkxRestClient,
  opts: { algoId: string; tpPrice: string; json: boolean },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/dca/settings/take-profit", {
    algoId:      opts.algoId,
    algoOrdType: "contract_dca",
    tpPrice:     opts.tpPrice,
  });
  if (opts.json) return printJson(res.data);
  process.stdout.write(`Take-profit set for ${opts.algoId}\n`);
}

export async function cmdContractDcaSetReinvest(
  client: OkxRestClient,
  opts: { algoId: string; allowReinvest: boolean; json: boolean },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/dca/settings/reinvestment", {
    algoId:        opts.algoId,
    algoOrdType:   "contract_dca",
    allowReinvest: opts.allowReinvest,
  });
  if (opts.json) return printJson(res.data);
  process.stdout.write(`Reinvestment set for ${opts.algoId}\n`);
}

export async function cmdContractDcaPositions(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/dca/position-details", {
    algoId:      opts.algoId,
    algoOrdType: "contract_dca",
  });
  if (opts.json) return printJson(res.data);
  const d = ((res.data as Record<string, unknown>[]) ?? [])[0];
  if (!d) { process.stdout.write("No position\n"); return; }
  printKv(d);
}

export async function cmdContractDcaCycles(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/dca/cycle-list", {
    algoId:      opts.algoId,
    algoOrdType: "contract_dca",
  });
  const cycles = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(cycles);
  if (!cycles.length) { process.stdout.write("No cycles\n"); return; }
  printTable(
    cycles.map((c) => ({
      cycleId:   c["cycleId"],
      state:     c["state"],
      pnl:       c["pnl"],
      createdAt: new Date(Number(c["cTime"])).toLocaleString(),
    })),
  );
}

export async function cmdContractDcaOrders(
  client: OkxRestClient,
  opts: { algoId: string; cycleId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/dca/orders", {
    algoId:      opts.algoId,
    algoOrdType: "contract_dca",
    cycleId:     opts.cycleId,
  });
  const orders = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No orders\n"); return; }
  printTable(
    orders.map((o) => ({
      ordId:   o["ordId"],
      side:    o["side"],
      px:      o["px"],
      sz:      o["sz"],
      fillPx:  o["fillPx"],
      fillSz:  o["fillSz"],
      state:   o["state"],
    })),
  );
}

export async function cmdContractDcaList(
  client: OkxRestClient,
  opts: { history: boolean; json: boolean },
): Promise<void> {
  const path = opts.history
    ? "/api/v5/tradingBot/dca/history-list"
    : "/api/v5/tradingBot/dca/ongoing-list";
  const res = await client.privateGet(path, { algoOrdType: "contract_dca" });
  const bots = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(bots);
  if (!bots.length) { process.stdout.write("No contract DCA bots\n"); return; }
  printTable(
    bots.map((o) => ({
      algoId:    o["algoId"],
      instId:    o["instId"],
      state:     o["state"],
      pnl:       o["pnl"],
      createdAt: new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

// ─── recurring buy ────────────────────────────────────────────────────────────

export async function cmdRecurringCreate(
  client: OkxRestClient,
  opts: {
    stgyName: string; recurringList: string; amt: string; period: string;
    recurringDay?: string; recurringTime?: string; timeZone?: string; tdMode?: string;
    json: boolean;
  },
): Promise<void> {
  const recurringList = JSON.parse(opts.recurringList) as Array<{ ccy: string; ratio: string }>;
  const body: Record<string, unknown> = {
    stgyName:      opts.stgyName,
    recurringList,
    amt:           opts.amt,
    investmentCcy: "USDT",
    period:        opts.period,
    recurringTime: opts.recurringTime ?? "9",
    timeZone:      opts.timeZone ?? "8",
    tdMode:        opts.tdMode ?? "cash",
  };
  if (opts.recurringDay) body["recurringDay"] = opts.recurringDay;
  const res = await client.privatePost("/api/v5/tradingBot/recurring/order-algo", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Recurring bot created: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdRecurringAmend(
  client: OkxRestClient,
  opts: { algoId: string; stgyName: string; json: boolean },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/recurring/amend-order-algo", {
    algoId:   opts.algoId,
    stgyName: opts.stgyName,
  });
  if (opts.json) return printJson(res.data);
  process.stdout.write(`Recurring bot renamed: ${opts.algoId}\n`);
}

export async function cmdRecurringStop(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privatePost("/api/v5/tradingBot/recurring/stop-order-algo", [
    { algoId: opts.algoId },
  ]);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(
    `Recurring bot stopped: ${r?.["algoId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}

export async function cmdRecurringOrders(
  client: OkxRestClient,
  opts: { history: boolean; json: boolean },
): Promise<void> {
  const path = opts.history
    ? "/api/v5/tradingBot/recurring/orders-algo-history"
    : "/api/v5/tradingBot/recurring/orders-algo-pending";
  const res = await client.privateGet(path, {});
  const bots = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(bots);
  if (!bots.length) { process.stdout.write("No recurring bots\n"); return; }
  printTable(
    bots.map((o) => ({
      algoId:    o["algoId"],
      stgyName:  o["stgyName"],
      state:     o["state"],
      period:    o["period"],
      amt:       o["amt"],
      createdAt: new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}

export async function cmdRecurringDetails(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/recurring/orders-algo-details", {
    algoId: opts.algoId,
  });
  const detail = ((res.data as Record<string, unknown>[]) ?? [])[0];
  if (!detail) { process.stdout.write("Bot not found\n"); return; }
  if (opts.json) return printJson(detail);
  printKv({
    algoId:        detail["algoId"],
    stgyName:      detail["stgyName"],
    state:         detail["state"],
    period:        detail["period"],
    amt:           detail["amt"],
    investmentCcy: detail["investmentCcy"],
    tdMode:        detail["tdMode"],
    createdAt:     new Date(Number(detail["cTime"])).toLocaleString(),
  });
}

export async function cmdRecurringSubOrders(
  client: OkxRestClient,
  opts: { algoId: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/tradingBot/recurring/sub-orders", {
    algoId: opts.algoId,
  });
  const orders = (res.data as Record<string, unknown>[]) ?? [];
  if (opts.json) return printJson(orders);
  if (!orders.length) { process.stdout.write("No sub-orders\n"); return; }
  printTable(
    orders.map((o) => ({
      ordId:     o["ordId"],
      ccy:       o["ccy"],
      side:      o["side"],
      avgPx:     o["avgPx"],
      sz:        o["sz"],
      state:     o["state"],
      createdAt: new Date(Number(o["cTime"])).toLocaleString(),
    })),
  );
}
