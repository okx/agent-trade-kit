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

/**
 * Translate order/fill outcome field using instId to distinguish series type.
 * price_up_down instIds contain "UPDOWN" → UP / DOWN
 * price_above / price_once_touch → YES / NO
 */
function fmtOrderOutcome(instId: unknown, outcome: unknown): string {
  const id = String(instId ?? "").toUpperCase();
  const isUpDown = id.includes("UPDOWN") || id.includes("UP-DOWN");
  if (outcome === "1" || outcome === 1) return isUpDown ? "UP" : "YES";
  if (outcome === "2" || outcome === 2) return isUpDown ? "DOWN" : "NO";
  return String(outcome ?? "");
}

/**
 * Parse instId to extract human-readable expiry time and settlement condition.
 * Format: {UNDERLYING}-{TYPE}-{FREQ}-{YYMMDD}-{HHMM}[-{STRIKE}]
 * e.g. BTC-ABOVE-DAILY-260320-1600-69700
 *      BTC-UPDOWN-15MIN-260320-1615
 */
function parseInstMeta(instId: string): { expiry: string; condition: string } {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();
  const underlying = parts[0] ?? "";

  let dateIdx = -1;
  let expiry = "";
  let strike = "";

  // Find date part (exactly 6 digits = YYMMDD)
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i])) {
      dateIdx = i;
      const p = parts[i];
      expiry = `20${p.slice(0, 2)}-${p.slice(2, 4)}-${p.slice(4, 6)}`;
      break;
    }
  }

  // Time is immediately after date (exactly 4 digits = HHMM)
  if (dateIdx >= 0 && dateIdx + 1 < parts.length) {
    const tp = parts[dateIdx + 1];
    if (/^\d{4}$/.test(tp)) {
      expiry += ` ${tp.slice(0, 2)}:${tp.slice(2)} UTC`;
    }
  }

  // Strike is at dateIdx+2 (digits only)
  if (dateIdx >= 0 && dateIdx + 2 < parts.length) {
    const sp = parts[dateIdx + 2];
    if (/^\d+$/.test(sp)) {
      strike = Number(sp).toLocaleString("en-US");
    }
  }

  let condition = "";
  if (upper.includes("UPDOWN") || upper.includes("UP-DOWN")) {
    condition = `${underlying} price rises during the period → UP wins; falls → DOWN wins`;
  } else if (upper.includes("ABOVE")) {
    condition = strike
      ? `${underlying} ≥ ${strike} at expiry → YES wins`
      : `${underlying} above strike at expiry → YES wins`;
  } else if (upper.includes("TOUCH")) {
    condition = strike
      ? `${underlying} touches ${strike} anytime → YES wins`
      : `${underlying} touches strike → YES wins`;
  }

  return { expiry, condition };
}

/**
 * Build a net PnL summary line from precheck response fields.
 * estMaxWin = gross settlement payout (sz × 1.00), NOT net profit.
 * Net max win  = estMaxWin  - estCost - estFee
 * Max loss     = estCost    + estFee
 */
function buildPrecheckSummary(row: Record<string, unknown>): string {
  const cost    = parseFloat(String(row["estCost"]  ?? "0")) || 0;
  const fee     = parseFloat(String(row["estFee"]   ?? "0")) || 0;
  const maxWin  = parseFloat(String(row["estMaxWin"] ?? "0")) || 0;
  const netWin  = maxWin - cost - fee;
  const netLoss = cost + fee;
  const instId  = String(row["instId"] ?? "");
  const side    = String(row["side"]   ?? "");
  const px      = String(row["px"]     ?? "");
  const ordType = String(row["ordType"] ?? "market");
  const outcome = fmtOrderOutcome(instId, row["outcome"]);
  const meta    = parseInstMeta(instId);

  const lines: string[] = [];
  if (outcome) lines.push(`Direction:    ${side.toUpperCase()} ${outcome}  ordType: ${ordType}${px ? `  px: ${px}` : ""}`);
  if (meta.condition) lines.push(`Condition:    ${meta.condition}`);
  if (meta.expiry)    lines.push(`Expires:      ${meta.expiry}`);
  lines.push(`──────────────────────────────────────`);
  lines.push(`Cost (premium): ${cost.toFixed(4)} USDC`);
  lines.push(`Fee (settled):  ${fee.toFixed(4)} USDC  ← charged at settlement, not upfront`);
  lines.push(`Max loss:       ${netLoss.toFixed(4)} USDC  (worst case: expires on wrong side)`);
  lines.push(`Net max win:    ${netWin >= 0 ? "+" : ""}${netWin.toFixed(4)} USDC  (if ${outcome || "correct side"} wins, after all fees)`);
  if (row["maxBuy"]) lines.push(`Max buy:        ${row["maxBuy"]} contracts`);
  return lines.join("\n  ");
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
  if (!row) {
    process.stdout.write("(no precheck data)\n");
    return;
  }
  // Show net figures first, then raw fields for AI context
  const summary = buildPrecheckSummary({
    ...row as Record<string, unknown>,
    instId: opts.instId,
    side:   opts.side,
  });
  process.stdout.write(`Precheck result:\n  ${summary}\n`);
  // Also dump raw fields so AI can read exact values
  process.stdout.write("\nRaw fields:\n");
  printKv(row as Record<string, unknown>);
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
      outcome: fmtOrderOutcome(o["instId"], o["outcome"]),
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
      outcome: fmtOrderOutcome(f["instId"], f["outcome"]),
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
  const ok = order?.["sCode"] === "0";
  if (!ok) {
    process.stdout.write(`Order rejected: ${order?.["sMsg"] ?? "unknown error"}\n`);
    return;
  }
  const ordType = opts.ordType ?? "market";
  const stateHint =
    ordType === "market"
      ? "market order — typically fills immediately"
      : `${ordType} order — may still be live; verify with: okx event orders --instId ${opts.instId} --state live`;
  process.stdout.write(
    `Order submitted: ${order?.["ordId"]}\n` +
    `  ${opts.side.toUpperCase()} ${opts.outcome.toUpperCase()}  sz: ${opts.sz}` +
    `${opts.px ? `  px: ${opts.px}` : ""}  type: ${ordType}\n` +
    `  (${stateHint})\n`,
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
  if (r?.["sCode"] === "0") {
    process.stdout.write(`Cancelled: ${r?.["ordId"]}\n`);
  } else {
    const sCode = String(r?.["sCode"] ?? "");
    const sMsg  = String(r?.["sMsg"] ?? "unknown error");
    const ordId = r?.["ordId"] ?? opts.ordId;
    const hint  =
      sCode === "51400"
        ? "The order may have already been filled or cancelled. No further action needed."
        : "";
    process.stdout.write(
      `Failed to cancel ${ordId}: ${sMsg}${hint ? `\n  ${hint}` : ""}\n`,
    );
  }
}
