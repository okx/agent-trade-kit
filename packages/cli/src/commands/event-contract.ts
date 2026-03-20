import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

// ---------------------------------------------------------------------------
// Display helpers — translate raw API enum values to human-readable strings
// ---------------------------------------------------------------------------

function fmtMethod(raw: unknown): string {
  const map: Record<string, string> = {
    PRICE_ABOVE:   "Price Above",
    PRICE_UP_DOWN: "Up/Down",
    ONE_TOUCH:     "One Touch",
  };
  return map[String(raw)] ?? String(raw ?? "");
}

function fmtFreq(raw: unknown): string {
  const map: Record<string, string> = {
    DAILY:       "Daily",
    FIFTEEN_MIN: "15min",
    HOURLY:      "1h",
    WEEKLY:      "Weekly",
  };
  return map[String(raw)] ?? String(raw ?? "");
}

function fmtTs(raw: unknown): string {
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isNaN(n)) return String(raw);
  return new Date(n).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export async function cmdEventSeries(
  run: ToolRunner,
  opts: { seriesId?: string; json: boolean },
): Promise<void> {
  const result = await run("event_get_series", {
    seriesId: opts.seriesId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((s) => ({
      seriesId:   s["seriesId"],
      title:      s["title"] ?? s["baseCcy"],
      type:       fmtMethod(s["method"]),
      freq:       fmtFreq(s["freq"]),
      underlying: s["underlying"] ?? s["baseCcy"],
      state:      s["state"],
    })),
  );
}

export async function cmdEventEvents(
  run: ToolRunner,
  opts: { seriesId: string; state?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("event_get_events", {
    seriesId: opts.seriesId,
    state: opts.state,
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((e) => ({
      eventId:    e["eventId"],
      state:      e["state"],
      expTime:    fmtTs(e["expTime"]),
      settleTime: fmtTs(e["settleTime"]),
    })),
  );
}

export async function cmdEventMarkets(
  run: ToolRunner,
  opts: { seriesId: string; eventId?: string; instId?: string; state?: string; json: boolean },
): Promise<void> {
  const result = await run("event_get_markets", {
    seriesId: opts.seriesId,
    eventId: opts.eventId,
    instId: opts.instId,
    state: opts.state,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((m) => ({
      instId:      m["instId"],
      type:        fmtMethod(m["method"]),
      strike:      m["stk"] ?? m["floorStrike"],
      freq:        fmtFreq(m["freq"]),
      state:       m["state"],
      outcome:     m["outcome"] ?? "",
      settleValue: m["settleValue"] ?? "",
    })),
  );
}

export async function cmdEventEnded(
  run: ToolRunner,
  opts: { seriesId: string; method: string; json: boolean },
): Promise<void> {
  const result = await run("event_get_ended", {
    seriesId: opts.seriesId,
    method: opts.method,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((m) => ({
      instId:      m["instId"],
      strike:      m["stk"],
      outcome:     m["outcome"],
      settleValue: m["settleValue"],
      expTime:     fmtTs(m["expTime"]),
    })),
  );
}

// ---------------------------------------------------------------------------
// Private queries
// ---------------------------------------------------------------------------

export async function cmdEventMaxSize(
  run: ToolRunner,
  opts: { instId: string; outcome: string; json: boolean },
): Promise<void> {
  const result = await run("event_get_max_size", {
    instId: opts.instId,
    outcome: opts.outcome,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const row = data?.[0];
  if (row) printKv(row as Record<string, unknown>);
}

export async function cmdEventPrecheck(
  run: ToolRunner,
  opts: {
    instId: string;
    side: string;
    outcome: string;
    sz: string;
    px?: string;
    ordType?: string;
    slippage?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("event_precheck_order", {
    instId: opts.instId,
    side: opts.side,
    outcome: opts.outcome,
    sz: opts.sz,
    px: opts.px,
    ordType: opts.ordType,
    slippage: opts.slippage,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const row = data?.[0];
  if (row) printKv(row as Record<string, unknown>);
}

export async function cmdEventOrders(
  run: ToolRunner,
  opts: { instId?: string; state?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("event_get_orders", {
    instId: opts.instId,
    state: opts.state,
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((o) => ({
      ordId: o["ordId"],
      instId: o["instId"],
      side: o["side"],
      outcome: o["outcome"],
      type: o["ordType"],
      price: o["px"],
      size: o["sz"],
      filled: o["fillSz"],
      state: o["state"],
    })),
  );
}

export async function cmdEventFills(
  run: ToolRunner,
  opts: { instId?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("event_get_fills", {
    instId: opts.instId,
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((f) => ({
      tradeId: f["tradeId"],
      ordId: f["ordId"],
      instId: f["instId"],
      side: f["side"],
      outcome: f["outcome"],
      fillPx: f["fillPx"],
      fillSz: f["fillSz"],
      time:   fmtTs(f["ts"]),
    })),
  );
}

// ---------------------------------------------------------------------------
// Private write
// ---------------------------------------------------------------------------

export async function cmdEventPlace(
  run: ToolRunner,
  opts: {
    instId: string;
    side: string;
    outcome: string;
    sz: string;
    px?: string;
    ordType?: string;
    slippage?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("event_place_order", {
    instId: opts.instId,
    side: opts.side,
    outcome: opts.outcome,
    sz: opts.sz,
    px: opts.px,
    ordType: opts.ordType,
    slippage: opts.slippage,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const order = data?.[0];
  process.stdout.write(
    `Order placed: ${order?.["ordId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`,
  );
}

export async function cmdEventCancel(
  run: ToolRunner,
  opts: { instId: string; ordId: string; json: boolean },
): Promise<void> {
  const result = await run("event_cancel_order", {
    instId: opts.instId,
    ordId: opts.ordId,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(
    `Cancelled: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`,
  );
}
