// OKX write endpoints return HTTP 200 with top-level code="0" even when an
// individual order is rejected (e.g. insufficient balance). The real per-item
// result is in each element's `sCode` field ("0" = success, anything else =
// business failure). This function detects that case and sets exit code 1 so
// that callers (LLMs, scripts) can rely on exit code alone to detect failure.
export function markFailedIfSCodeError(data: unknown): void {
  // Read-only endpoints return plain arrays without sCode — skip them.
  if (!Array.isArray(data)) return;
  for (const item of data) {
    if (item !== null && typeof item === "object") {
      const sCode = (item as Record<string, unknown>)["sCode"];
      // sCode absent → not a write-response item, ignore.
      // sCode "0" or 0 → success.
      // anything else → business failure (e.g. "51008" = insufficient balance).
      if (sCode !== undefined && sCode !== "0" && sCode !== 0) {
        process.exitCode = 1;
        return;
      }
    }
  }
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    process.stdout.write("(no data)\n");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  const header = keys.map((k, i) => k.padEnd(widths[i])).join("  ");
  const divider = widths.map((w) => "-".repeat(w)).join("  ");
  process.stdout.write(header + "\n" + divider + "\n");
  for (const row of rows) {
    process.stdout.write(
      keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join("  ") + "\n",
    );
  }
}

export function printKv(obj: Record<string, unknown>, indent = 0): void {
  const pad = " ".repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      process.stdout.write(`${pad}${k}:\n`);
      printKv(v as Record<string, unknown>, indent + 2);
    } else {
      process.stdout.write(`${pad}${k.padEnd(20 - indent)}  ${v}\n`);
    }
  }
}
