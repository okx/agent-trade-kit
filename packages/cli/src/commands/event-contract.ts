import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printTable } from "../formatter.js";

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

/** outcome field in markets response: already translated by MCP — "YES", "NO", "UP", "DOWN", "pending", or empty */
function fmtOutcome(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase();
  if (s === "" || s === "pending") return "";
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
  if (outcome === "1" || outcome === 1 || outcome === "yes") return isUpDown ? "UP" : "YES";
  if (outcome === "2" || outcome === 2 || outcome === "no")  return isUpDown ? "DOWN" : "NO";
  return String(outcome ?? "");
}

/**
 * Parse instId to infer contract START time in UTC ms.
 * For UPDOWN (DATE-START-END): start = first time part.
 * For ABOVE/TOUCH (DATE-EXPIRY-STRIKE): no distinct start time, returns null.
 * Times encoded in instId are UTC+8.
 */
function inferStartMsFromInstId(instId: string): number | null {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();
  if (!upper.includes("UPDOWN")) return null; // only UPDOWN encodes start time
  let dateIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) { dateIdx = i; break; }
  }
  if (dateIdx < 0) return null;
  const dp = parts[dateIdx]!;
  const year  = 2000 + parseInt(dp.slice(0, 2), 10);
  const month = parseInt(dp.slice(2, 4), 10) - 1;
  const day   = parseInt(dp.slice(4, 6), 10);
  const timePart = parts[dateIdx + 1];
  if (!timePart || !/^\d{4}$/.test(timePart)) return null;
  const hour = parseInt(timePart.slice(0, 2), 10);
  const min  = parseInt(timePart.slice(2, 4), 10);
  return Date.UTC(year, month, day, hour - 8, min, 0, 0);
}

/**
 * Parse instId to infer contract expiry time in UTC ms.
 * Returns null if format is unrecognized.
 */
function inferExpiryMsFromInstId(instId: string): number | null {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();
  let dateIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) { dateIdx = i; break; }
  }
  if (dateIdx < 0) return null;
  const dp = parts[dateIdx]!;
  const year  = 2000 + parseInt(dp.slice(0, 2), 10);
  const month = parseInt(dp.slice(2, 4), 10) - 1;
  const day   = parseInt(dp.slice(4, 6), 10);
  const isUpDown = upper.includes("UPDOWN");
  let timePart: string | undefined;
  if (isUpDown) {
    const candidate = parts[dateIdx + 2];
    timePart = (candidate && /^\d{4}$/.test(candidate)) ? candidate : parts[dateIdx + 1];
  } else {
    timePart = parts[dateIdx + 1];
  }
  if (!timePart || !/^\d{4}$/.test(timePart)) return null;
  const hour = parseInt(timePart.slice(0, 2), 10);
  const min  = parseInt(timePart.slice(2, 4), 10);
  return Date.UTC(year, month, day, hour - 8, min, 0, 0);
}

/**
 * Convert instId to a short human-readable contract name.
 * SOLVU-ABOVE-DAILY-260401-1600-70000  → "SOLVU 高于 70,000 · 4/1"
 * TESTAAAA-UPDOWN-15MIN-260325-1830-1845 → "TESTAAAA 涨跌 · 3/25 18:30-18:45"
 */
function fmtContractName(instId: string): string {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();
  const seriesId = parts[0] ?? instId;

  let dateIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i])) { dateIdx = i; break; }
  }
  if (dateIdx < 0) return instId;

  const d = parts[dateIdx];
  const month = parseInt(d.slice(2, 4), 10);
  const day   = parseInt(d.slice(4, 6), 10);
  const dateStr = `${month}/${day}`;

  if (upper.includes("UPDOWN") || upper.includes("UP-DOWN")) {
    const t1 = parts[dateIdx + 1] ?? "";
    const t2 = parts[dateIdx + 2] ?? "";
    const fmtT = (t: string) => t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t;
    const timeRange = t1 && t2 ? ` ${fmtT(t1)}-${fmtT(t2)}` : "";
    return `${seriesId} Up/Down · ${dateStr}${timeRange}`;
  }

  const strike = parts[dateIdx + 2] ?? "";
  const strikeStr = strike && /^\d+$/.test(strike)
    ? Number(strike).toLocaleString("en-US")
    : "";

  if (upper.includes("ABOVE")) {
    return strikeStr ? `${seriesId} above ${strikeStr} · ${dateStr}` : `${seriesId} · ${dateStr}`;
  }
  if (upper.includes("TOUCH")) {
    return strikeStr ? `${seriesId} touch ${strikeStr} · ${dateStr}` : `${seriesId} · ${dateStr}`;
  }
  return `${seriesId} · ${dateStr}`;
}

/**
 * Format contract period from instId as "YYYY-MM-DD HH:mm ~ HH:mm UTC+8".
 * For UPDOWN: shows start ~ end. For ABOVE/TOUCH: shows expiry only.
 */
function fmtPeriodFromInstId(instId: string): string {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();
  let dateIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) { dateIdx = i; break; }
  }
  if (dateIdx < 0) return instId;
  const dp = parts[dateIdx]!;
  const date = `20${dp.slice(0, 2)}-${dp.slice(2, 4)}-${dp.slice(4, 6)}`;
  const fmt = (t: string) => t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t;
  const t1 = parts[dateIdx + 1] ?? "";
  const t2 = parts[dateIdx + 2] ?? "";
  const isUpDown = upper.includes("UPDOWN");
  if (isUpDown && /^\d{4}$/.test(t1) && /^\d{4}$/.test(t2)) {
    return `${date} ${fmt(t1)} ~ ${fmt(t2)} UTC+8`;
  }
  if (/^\d{4}$/.test(t1)) {
    return `${date} ${fmt(t1)} UTC+8`;
  }
  return instId;
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

export async function cmdEventBrowse(
  run: ToolRunner,
  opts: { underlying?: string; json: boolean },
): Promise<void> {
  const result = await run("event_browse", { underlying: opts.underlying });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!data || data.length === 0) {
    process.stdout.write("No active event contracts found.\n");
    return;
  }
  for (const group of data) {
    const contracts = (group["contracts"] as Record<string, unknown>[]) ?? [];
    const methodLabel = fmtMethod(group["method"]);
    const freqLabel   = fmtFreq(group["freq"]);
    process.stdout.write(`\n[${methodLabel}] ${group["underlying"]}  (${freqLabel})\n`);
    printTable(
      contracts.map((c) => ({
        "Contract": c["instId"],
        "Expiry":   c["expTime"] ?? "",
        "Target Price":   c["floorStrike"] ? String(c["floorStrike"]) : "—",
        "Status":   String(c["outcome"] ?? "").toLowerCase() === "pending" ? "In Progress" : String(c["outcome"] ?? ""),
      })),
    );
  }
  const total = data.reduce((n, g) => n + ((g["contracts"] as unknown[])?.length ?? 0), 0);
  process.stdout.write(`\n${total} active contract(s) across ${data.length} series.\n`);
}

// Standard series get ⭐ and are always shown first.
const FEATURED_SERIES = new Set([
  "BTC-UPDOWN-15MIN", "ETH-UPDOWN-15MIN", "TRX-UPDOWN-15MIN",
  "BTC-ABOVE-DAILY",  "ETH-ABOVE-DAILY",
]);

// Well-known crypto prefixes — series with these underlying are shown by default.
const KNOWN_PREFIXES = /^(BTC|ETH|TRX|SOL|EOS|BNB|XRP|ADA|DOGE|IOTA|SUSHI|KISHU|BTG|XTZ)-/i;

export async function cmdEventSeries(
  run: ToolRunner,
  opts: { seriesId?: string; all?: boolean; json: boolean },
): Promise<void> {
  const result = await run("event_get_series", { seriesId: opts.seriesId });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);

  type Row = { Series: string; Type: string; Freq: string; Underlying: string; State: string };

  const toRow = (s: Record<string, unknown>, featured: boolean): Row => {
    const settlement = s["settlement"] as Record<string, unknown> | undefined;
    const method     = settlement?.["method"] ?? s["method"];
    const underlying = settlement?.["underlying"] ?? s["underlying"] ?? s["baseCcy"];
    return {
      Series:     `${featured ? "⭐ " : ""}${String(s["seriesId"] ?? "")}`,
      Type:       fmtMethod(method),
      Freq:       fmtFreq(s["freq"]),
      Underlying: String(underlying ?? ""),
      State:      String(s["state"] ?? ""),
    };
  };

  const all = data ?? [];
  const featured   = all.filter(s => FEATURED_SERIES.has(String(s["seriesId"] ?? "")));
  const standard   = all.filter(s => !FEATURED_SERIES.has(String(s["seriesId"] ?? "")) && KNOWN_PREFIXES.test(String(s["seriesId"] ?? "")));
  const testSeries = all.filter(s => !FEATURED_SERIES.has(String(s["seriesId"] ?? "")) && !KNOWN_PREFIXES.test(String(s["seriesId"] ?? "")));

  // Group by type: UPDOWN first, ABOVE second
  const updown = [...featured, ...standard].filter(s => {
    const method = (s["settlement"] as Record<string, unknown> | undefined)?.["method"] ?? s["method"];
    return String(method ?? "").toLowerCase().includes("up_down") || String(method ?? "").toLowerCase().includes("updown");
  });
  const above = [...featured, ...standard].filter(s => {
    const method = (s["settlement"] as Record<string, unknown> | undefined)?.["method"] ?? s["method"];
    return !String(method ?? "").toLowerCase().includes("up_down") && !String(method ?? "").toLowerCase().includes("updown");
  });

  if (updown.length > 0) {
    process.stdout.write("\n── Up/Down ──\n");
    printTable(updown.map(s => toRow(s, FEATURED_SERIES.has(String(s["seriesId"] ?? "")))));
  }
  if (above.length > 0) {
    process.stdout.write("\n── Price Above ──\n");
    printTable(above.map(s => toRow(s, FEATURED_SERIES.has(String(s["seriesId"] ?? "")))));
  }

  if (testSeries.length > 0) {
    if (opts.all) {
      process.stdout.write("\n── Test / Other ──\n");
      printTable(testSeries.map(s => toRow(s, false)));
    } else {
      process.stdout.write(`\n${testSeries.length} test series hidden (use --all to show)\n`);
    }
  }
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
  opts: { seriesId: string; eventId?: string; instId?: string; state?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("event_get_markets", {
    seriesId: opts.seriesId,
    eventId: opts.eventId,
    instId: opts.instId,
    state: opts.state,
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);

  // Display current index price and available USDT if present in result
  const ext = result as unknown as Record<string, unknown>;
  const currentIdxPx = ext["currentIdxPx"];
  const underlying = ext["underlying"];
  const availableUsdt = ext["availableUsdt"];
  if (currentIdxPx != null) {
    process.stdout.write(
      `${underlying ?? ""} current index price: $${currentIdxPx}  |  Available USDT: ${availableUsdt ?? "N/A"}\n`,
    );
  }

  const now = Date.now();
  // Sort by expiry ascending: nearest expiry first
  const sorted = [...(data ?? [])].sort((a, b) => {
    const ea = inferExpiryMsFromInstId(String(a["instId"] ?? "")) ?? Infinity;
    const eb = inferExpiryMsFromInstId(String(b["instId"] ?? "")) ?? Infinity;
    return ea - eb;
  });
  printTable(
    sorted.map((m) => {
      const instId = String(m["instId"] ?? "");
      const expiryMs  = inferExpiryMsFromInstId(instId);
      const startMs   = inferStartMsFromInstId(instId);
      const notExpired = expiryMs === null || now < expiryMs;
      const hasStarted = notExpired && (
        (m["floorStrike"] !== "" && m["floorStrike"] != null) ||
        (startMs !== null && startMs <= now)
      );
      return {
        instId,
        status:      !notExpired ? "Settled" : hasStarted ? "In Progress" : "Upcoming",
        expTime:     m["expTime"] ?? "",
        targetPrice: m["floorStrike"] ?? "",
        outcome:     fmtOutcome(m["outcome"]),
        settleValue: m["settleValue"] ?? "",
      };
    }),
  );
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
      "Contract":   fmtContractName(String(o["instId"] ?? "")),
      "Time":       fmtTs(o["cTime"]),
      "Direction":  `${String(o["side"] ?? "").toUpperCase()} ${fmtOrderOutcome(o["instId"], o["outcome"]).toUpperCase()}`,
      "Price":      o["px"],
      "Size":       `${o["fillSz"] ?? 0} / ${o["sz"]}`,
      "Status":     o["state"],
      "Order ID":   o["ordId"],
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
      "Contract":  fmtContractName(String(f["instId"] ?? "")),
      "Direction": (() => {
        const side    = String(f["side"] ?? "").toUpperCase();
        const outcome = fmtOrderOutcome(f["instId"], f["outcome"]).toUpperCase();
        const dir     = `${side} ${outcome}`.trim();
        return dir || "—";
      })(),
      "Fill Price": f["fillPx"],
      "Fill Size":  f["fillSz"],
      "Time":       fmtTs(f["ts"]),
      "Order ID":   f["ordId"],
    })),
  );
}

// ---------------------------------------------------------------------------
// Private write
// ---------------------------------------------------------------------------

/**
 * Extract seriesId from a full event contract instId.
 * e.g. "BTC-UPDOWN-15MIN-260325-1700-1715" → "BTC-UPDOWN-15MIN"
 *      "BTC-ABOVE-DAILY-260320-1600-69700"  → "BTC-ABOVE-DAILY"
 */
function extractSeriesId(instId: string): string {
  const parts = instId.split("-");
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) {
      return parts.slice(0, i).join("-");
    }
  }
  return instId;
}

export async function cmdEventPlace(
  run: ToolRunner,
  opts: {
    instId: string;
    side: string;
    outcome: string;
    sz: string;
    px?: string;
    ordType?: string;
    json: boolean;
  },
): Promise<void> {
  let result: unknown;
  try {
    result = await run("event_place_order", {
      instId: opts.instId,
      side: opts.side,
      outcome: opts.outcome,
      sz: opts.sz,
      px: opts.px,
      ordType: opts.ordType,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const expiryMs = inferExpiryMsFromInstId(opts.instId);
    const isExpired = expiryMs !== null && expiryMs < Date.now();
    if (isExpired) {
      process.stdout.write(
        `Order failed: Contract ${opts.instId} has expired.\n` +
        `Checking next available contracts in this series...\n`,
      );
      const seriesId = extractSeriesId(opts.instId);
      try {
        const mkts = await run("event_get_markets", { seriesId, state: "live" });
        const mData = (getData(mkts) as Record<string, unknown>[]) ?? [];
        const active = mData.filter((m) => m["floorStrike"] && m["floorStrike"] !== "");
        if (active.length > 0) {
          printTable(
            active.slice(0, 3).map((m) => ({
              instId:  m["instId"],
              expTime: m["expTime"] ?? "",
              targetPrice:  m["floorStrike"] ?? "",
            })),
          );
          const next = active[0]!;
          const nextInstId  = String(next["instId"]);
          const pxFlag      = opts.px      ? ` --px ${opts.px}`           : "";
          const ordTypeFlag = opts.ordType ? ` --ordType ${opts.ordType}` : "";
          process.stdout.write(
            `\nTo place the same order on the next contract:\n` +
            `  okx event place ${nextInstId} ${opts.side} ${opts.outcome} ${opts.sz}${pxFlag}${ordTypeFlag}\n`,
          );
        } else {
          process.stdout.write(`No active contracts found in this series.\n`);
        }
      } catch {
        // silently ignore — main message already printed
      }
    } else if (msg.includes("not found") || msg.includes("51001")) {
      process.stdout.write(`Order failed: Contract ${opts.instId} not found or not yet available.\n`);
    } else {
      process.stdout.write(`Order failed: ${msg}\n`);
    }
    return;
  }

  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const order = data?.[0];
  const ordType = opts.ordType ?? "market";
  const stateHint =
    ordType === "market"
      ? "market order — typically fills immediately"
      : `${ordType} order — may still be live; verify with: okx event orders --instId ${opts.instId} --state live`;
  const period = fmtPeriodFromInstId(opts.instId);
  process.stdout.write(
    `Order submitted: ${order?.["ordId"]}\n` +
    `  Period: ${period}\n` +
    `  ${opts.side.toUpperCase()} ${opts.outcome.toUpperCase()}  sz: ${opts.sz}` +
    `${opts.px ? `  px: ${opts.px}` : ""}  type: ${ordType}\n` +
    `  (${stateHint})\n`,
  );
  if (ordType === "market") {
    process.stdout.write("  Note: exchange converts sz (amount) to contracts based on best available price\n");
  }
}

export async function cmdEventAmend(
  run: ToolRunner,
  opts: { instId: string; ordId: string; px?: string; sz?: string; json: boolean },
): Promise<void> {
  let result: unknown;
  try {
    result = await run("event_amend_order", {
      instId: opts.instId,
      ordId:  opts.ordId,
      newPx:  opts.px,
      newSz:  opts.sz,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`Failed to amend order ${opts.ordId}: ${msg}\n`);
    return;
  }
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  if (r?.["sCode"] === "0") {
    process.stdout.write(
      `Amended: ${r?.["ordId"]}` +
      `${opts.px ? `  new px: ${opts.px}` : ""}` +
      `${opts.sz ? `  new sz: ${opts.sz}` : ""}\n`,
    );
  } else {
    const sCode = String(r?.["sCode"] ?? "");
    const sMsg  = String(r?.["sMsg"] ?? "unknown error");
    process.stdout.write(`Failed to amend order ${opts.ordId}: [${sCode}] ${sMsg}\n`);
  }
}

export async function cmdEventCancel(
  run: ToolRunner,
  opts: { instId: string; ordId: string; json: boolean },
): Promise<void> {
  let result: unknown;
  try {
    result = await run("event_cancel_order", {
      instId: opts.instId,
      ordId: opts.ordId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const expiryMs = inferExpiryMsFromInstId(opts.instId);
    const isExpired = expiryMs !== null && expiryMs < Date.now();
    if (isExpired) {
      process.stdout.write(
        `Cannot cancel: contract ${opts.instId} has already expired.\n` +
        `  The order was auto-cancelled at settlement — no action needed.\n`,
      );
    } else {
      process.stdout.write(`Failed to cancel order ${opts.ordId}: ${msg}\n`);
    }
    return;
  }
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
