import { EOL } from "node:os";

// ---------------------------------------------------------------------------
// Output interface — defines the contract for any IO sink.
// The default implementation writes to process.stdout/stderr.
// Swap it out in tests or to redirect to a file.
// ---------------------------------------------------------------------------

export interface CliOutput {
  out(message: string): void;
  err(message: string): void;
}

const stdioOutput: CliOutput = {
  out: (message) => process.stdout.write(message),
  err: (message) => process.stderr.write(message),
};

let activeOutput: CliOutput = stdioOutput;

export function setOutput(impl: CliOutput): void {
  activeOutput = impl;
}

export function resetOutput(): void {
  activeOutput = stdioOutput;
}

// ---------------------------------------------------------------------------
// Environment context — injected once in main() after config load.
// When null, all output functions behave as before (backward compat).
// ---------------------------------------------------------------------------

export interface EnvContext {
  demo: boolean;
  profile: string;
}

let envContext: EnvContext | null = null;

export function setEnvContext(ctx: EnvContext): void {
  envContext = ctx;
}

export function resetEnvContext(): void {
  envContext = null;
}

// Emit a raw string to stdout. Use this when the message already
// contains newlines (e.g. multi-line blocks, pre-formatted output).
export function output(message: string): void {
  activeOutput.out(message);
}

// Emit a raw string to stderr. Use this when the message already
// contains newlines (e.g. multi-line blocks, pre-formatted output).
export function errorOutput(message: string): void {
  activeOutput.err(message);
}

// Emit a single line to stdout. Automatically appends the platform newline
// (os.EOL) so callers never hard-code "\n".
export function outputLine(message: string): void {
  activeOutput.out(message + EOL);
}

// Emit a single line to stderr. Automatically appends the platform newline
// (os.EOL) so callers never hard-code "\n".
export function errorLine(message: string): void {
  activeOutput.err(message + EOL);
}

// ---------------------------------------------------------------------------
// Structured output helpers (always write to stdout)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Opt-in JSON env wrapper — controlled by the --env CLI flag.
// When disabled (default), printJson outputs raw data for backward compat.
// When enabled, printJson wraps the data with {env, profile, data}.
// ---------------------------------------------------------------------------

let jsonEnvEnabled = false;

export function setJsonEnvEnabled(enabled: boolean): void {
  jsonEnvEnabled = enabled;
}

export function resetJsonEnvEnabled(): void {
  jsonEnvEnabled = false;
}

export function printJson(data: unknown): void {
  const payload = jsonEnvEnabled && envContext
    ? {
        env: envContext.demo ? "demo" : "live",
        profile: envContext.profile,
        data,
      }
    : data;
  activeOutput.out(JSON.stringify(payload, null, 2) + EOL);
}

export function printTable(rows: Record<string, unknown>[]): void {
  if (envContext) {
    const envLabel = envContext.demo ? "demo (simulated trading)" : "live";
    activeOutput.out(`Environment: ${envLabel}` + EOL + EOL);
  }
  if (rows.length === 0) {
    activeOutput.out("(no data)" + EOL);
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  const header = keys.map((k, i) => k.padEnd(widths[i])).join("  ");
  const divider = widths.map((w) => "-".repeat(w)).join("  ");
  activeOutput.out(header + EOL + divider + EOL);
  for (const row of rows) {
    activeOutput.out(keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join("  ") + EOL);
  }
}

export function printKv(obj: Record<string, unknown>, indent = 0): void {
  const pad = " ".repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      activeOutput.out(`${pad}${k}:${EOL}`);
      printKv(v as Record<string, unknown>, indent + 2);
    } else {
      activeOutput.out(`${pad}${k.padEnd(20 - indent)}  ${v}${EOL}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Exit-code helper
// ---------------------------------------------------------------------------

// OKX write endpoints return HTTP 200 with top-level code="0" even when an
// individual order is rejected (e.g. insufficient balance). The real per-item
// result is in each element's `sCode` field ("0" = success, anything else =
// business failure). This function detects that case and sets exit code 1 so
// that callers (LLMs, scripts) can rely on exit code alone to detect failure.
/** Extract `.data` array from a tool result object. Returns `[]` if absent. */
export function extractData(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>)["data"];
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

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
