import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
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
  if (!open.length) { process.stdout.write("No open positions\n"); return; }
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
    px?: string;
    reduceOnly?: boolean;
    clOrdId?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("option_place_order", {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
    px: opts.px,
    reduceOnly: opts.reduceOnly,
    clOrdId: opts.clOrdId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const order = data?.[0];
  process.stdout.write(`Order placed: ${order?.["ordId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`);
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
  const r = data?.[0];
  process.stdout.write(`Cancelled: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
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
  const r = data?.[0];
  process.stdout.write(`Amended: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
}

export async function cmdOptionBatchCancel(
  run: ToolRunner,
  opts: { orders: string; json: boolean },
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
  const result = await run("option_batch_cancel", { orders: parsed });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  for (const r of data ?? []) {
    process.stdout.write(`${r["ordId"]}: ${r["sCode"] === "0" ? "OK" : r["sMsg"]}\n`);
  }
}
