import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function fmtMethod(raw: unknown): string {
  const map: Record<string, string> = {
    // API returns values in various cases; normalise to lowercase for lookup
    price_above:      "Price Above",
    price_up_down:    "Up/Down",
    price_once_touch: "One Touch",
    // Uppercase variants (in case API returns them)
    PRICE_ABOVE:      "Price Above",
    PRICE_UP_DOWN:    "Up/Down",
    PRICE_ONCE_TOUCH: "One Touch",
  };
  return map[String(raw)] ?? String(raw ?? "");
}

function fmtFreq(raw: unknown): string {
  const map: Record<string, string> = {
    fifteen_min: "15min",
    daily:       "Daily",
    hourly:      "1h",
    weekly:      "Weekly",
    FIFTEEN_MIN: "15min",
    DAILY:       "Daily",
    HOURLY:      "1h",
    WEEKLY:      "Weekly",
  };
  return map[String(raw)] ?? String(raw ?? "");
}

/** outcome field in markets response: "0"=pending, "1"=YES, "2"=NO */
function fmtOutcome(raw: unknown): string {
  if (raw === "0" || raw === 0 || raw === "") return "";
  if (raw === "1" || raw === 1) return "YES";
  if (raw === "2" || raw === 2) return "NO";
  return String(raw ?? "");
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
  const result = await run("event_get_series", { seriesId: opts.seriesId });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((s) => {
      // API may return settlement.method nested or flat at top level
      const settlement = s["settlement"] as Record<string, unknown> | undefined;
      const method = settlement?.["method"] ?? s["method"];
      const underlying = settlement?.["underlying"] ?? s["underlying"] ?? s["baseCcy"];
      return {
        seriesId:   s["seriesId"],
        title:      s["title"] ?? s["baseCcy"],
        type:       fmtMethod(method),
        freq:       fmtFreq(s["freq"]),
        underlying,
        state:      s["state"],
      };
    }),
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
      strike:      m["floorStrike"],
      state:       m["state"],
      outcome:     fmtOutcome(m["outcome"]),
      settleValue: m["settleValue"] ?? "",
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
      ordId:   o["ordId"],
      instId:  o["instId"],
      side:    o["side"],
      outcome: o["outcome"],
      type:    o["ordType"],
      price:   o["px"],
      size:    o["sz"],
      filled:  o["fillSz"],
      state:   o["state"],
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
      ordId:   f["ordId"],
      instId:  f["instId"],
      side:    f["side"],
      outcome: f["outcome"],
      fillPx:  f["fillPx"],
      fillSz:  f["fillSz"],
      time:    fmtTs(f["ts"]),
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
