/**
 * Pure string formatting utilities for event contract display.
 * No external dependencies — safe to use from both MCP and CLI layers.
 */

function findDateIdx(parts: string[]): number {
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) return i;
  }
  return -1;
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
