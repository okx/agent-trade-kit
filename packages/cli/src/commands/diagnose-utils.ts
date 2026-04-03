import fs from "node:fs";

import { createRequire } from "node:module";
import { outputLine, errorLine } from "../formatter.js";

const _require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Version helpers (shared between diagnose.ts and diagnose-mcp.ts)
// ---------------------------------------------------------------------------

export function readCliVersion(): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      return (_require(rel) as { version: string }).version;
    } catch (_err: unknown) {
      // Path not found in this layout (bundled vs source) — try next
    }
  }
  return "0.0.0";
}

// ---------------------------------------------------------------------------
// Report collector — accumulates raw data for the copy-paste block
// ---------------------------------------------------------------------------

export interface ReportLine { key: string; value: string }

export class Report {
  private lines: ReportLine[] = [];

  add(key: string, value: string): void {
    this.lines.push({ key, value });
  }

  print(): void {
    const sep = "\u2500".repeat(52);
    outputLine("");
    outputLine(`  \u2500\u2500 Diagnostic Report (copy & share) ${sep.slice(35)}`);
    for (const { key, value } of this.lines) {
      outputLine(`  ${key.padEnd(14)} ${value}`);
    }
    outputLine(`  ${sep}`);
    outputLine("");
  }

  /** Write report to a file path, returns true on success. */
  writeToFile(filePath: string): boolean {
    try {
      const sep = "-".repeat(52);
      const lines: string[] = [
        `-- Diagnostic Report (copy & share) ${sep.slice(35)}`,
      ];
      for (const { key, value } of this.lines) {
        lines.push(`${key.padEnd(14)} ${value}`);
      }
      lines.push(sep, "");
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      return true;
    } catch (_e) {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function ok(label: string, detail: string): void {
  outputLine(`  \u2713 ${label.padEnd(14)} ${detail}`);
}

export function fail(label: string, detail: string, hints: string[]): void {
  outputLine(`  \u2717 ${label.padEnd(14)} ${detail}`);
  for (const hint of hints) {
    outputLine(`    \u2192 ${hint}`);
  }
}

export function warn(label: string, detail: string, hints: string[] = []): void {
  outputLine(`  \u26a0 ${label.padEnd(14)} ${detail}`);
  for (const hint of hints) {
    outputLine(`    \u2192 ${hint}`);
  }
}

export function section(title: string): void {
  outputLine("");
  outputLine(`  ${title}`);
}

// ---------------------------------------------------------------------------
// Output file helper — shared between diagnose.ts and diagnose-mcp.ts
// ---------------------------------------------------------------------------

export function writeReportIfRequested(report: Report, outputPath?: string): void {
  if (!outputPath) return;
  const written = report.writeToFile(outputPath);
  if (written) {
    outputLine(`  Report saved to: ${outputPath}`);
  } else {
    errorLine(`  Warning: failed to write report to: ${outputPath}`);
  }
}

// ---------------------------------------------------------------------------
// Sanitization — strip secrets / long hex / UUIDs before sharing
// ---------------------------------------------------------------------------

export function sanitize(value: string): string {
  // UUID-like patterns (e.g. 550e8400-e29b-41d4-a716-446655440000)
  value = value.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "****-uuid-****",
  );
  // Long hex strings (32+ chars) — likely keys/tokens
  value = value.replace(/\b[0-9a-f]{32,}\b/gi, "****hex****");
  // Bearer/token patterns
  value = value.replace(/Bearer\s+\S{8,}/gi, "Bearer ****");
  return value;
}
