/**
 * Pure string formatting utilities for event contract display.
 * No external dependencies — safe to use from both MCP and CLI layers.
 */

export function findDateIdx(parts: string[]): number {
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) return i;
  }
  return -1;
}

/**
 * Parse instId to infer contract expiry time in UTC ms.
 * Handles UPDOWN (expiry = end time, second time part) and ABOVE/TOUCH (expiry = first time part).
 * Times encoded in instId are UTC+8.
 * Returns null if format is unrecognized.
 */
export function inferExpiryMsFromInstId(instId: string): number | null {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();

  const dateIdx = findDateIdx(parts);
  if (dateIdx < 0) return null;

  const dp = parts[dateIdx]!;
  // 2-digit year assumption: valid through 2099
  const year  = 2000 + parseInt(dp.slice(0, 2), 10);
  const month = parseInt(dp.slice(2, 4), 10) - 1; // 0-based
  const day   = parseInt(dp.slice(4, 6), 10);

  // UPDOWN: DATE-START-END → expiry is END (parts[dateIdx+2] if 4 digits)
  // ABOVE/TOUCH: DATE-EXPIRY-STRIKE → expiry is parts[dateIdx+1]
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
  // Shift from UTC+8 to UTC
  return Date.UTC(year, month, day, hour - 8, min, 0, 0);
}

/**
 * Extract series ID from a full event contract instrument ID.
 * e.g. "BTC-UPDOWN-15MIN-260325-1700-1715" → "BTC-UPDOWN-15MIN"
 *      "BTC-ABOVE-DAILY-260320-1600-69700"  → "BTC-ABOVE-DAILY"
 */
export function extractSeriesId(instId: string): string {
  const parts = instId.split("-");
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) {
      return parts.slice(0, i).join("-");
    }
  }
  return instId;
}

function fmtTimeToken(t: string): string {
  return t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t;
}

function fmtUpDownName(seriesId: string, dateStr: string, parts: string[], dateIdx: number): string {
  const t1 = parts[dateIdx + 1] ?? "";
  const t2 = parts[dateIdx + 2] ?? "";
  const timeRange = t1 && t2 ? ` ${fmtTimeToken(t1)}-${fmtTimeToken(t2)}` : "";
  return `${seriesId} Up/Down · ${dateStr}${timeRange}`;
}

function fmtStrikeName(seriesId: string, dateStr: string, label: string, parts: string[], dateIdx: number): string {
  const strike = parts[dateIdx + 2] ?? "";
  const strikeStr = strike && /^\d+$/.test(strike)
    ? Number(strike).toLocaleString("en-US")
    : "";
  return strikeStr ? `${seriesId} ${label} ${strikeStr} · ${dateStr}` : `${seriesId} · ${dateStr}`;
}

/**
 * Convert instId to a short human-readable contract name.
 * Unknown format → returns original instId.
 *
 * @example
 * formatDisplayTitle("BTC-ABOVE-DAILY-260401-1600-70000")  // "BTC above 70,000 · 4/1"
 * formatDisplayTitle("BTC-UPDOWN-15MIN-260325-1830-1845")  // "BTC Up/Down · 3/25 18:30-18:45"
 * formatDisplayTitle("BTC-TOUCH-DAILY-260401-1600-70000")  // "BTC touch 70,000 · 4/1"
 */
export function formatDisplayTitle(instId: string): string {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();
  const seriesId = parts[0] ?? instId;

  const dateIdx = findDateIdx(parts);
  if (dateIdx < 0) return instId;

  const d = parts[dateIdx]!;
  const month = parseInt(d.slice(2, 4), 10);
  const day   = parseInt(d.slice(4, 6), 10);
  const dateStr = `${month}/${day}`;

  // Support both current "UPDOWN" and legacy "UP-DOWN" instId formats
  if (upper.includes("UPDOWN") || upper.includes("UP-DOWN")) {
    return fmtUpDownName(seriesId, dateStr, parts, dateIdx);
  }
  if (upper.includes("ABOVE")) {
    return fmtStrikeName(seriesId, dateStr, "above", parts, dateIdx);
  }
  if (upper.includes("TOUCH")) {
    return fmtStrikeName(seriesId, dateStr, "touch", parts, dateIdx);
  }
  return `${seriesId} · ${dateStr}`;
}
