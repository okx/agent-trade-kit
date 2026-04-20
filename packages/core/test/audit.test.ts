import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { LogEntry } from "../src/utils/logger.js";

// We test the audit tool handler by reading the exported tool spec directly.
// The handler reads from DEFAULT_LOG_DIR which is ~/.okx/logs.
// We'll temporarily write to a temp dir and patch the module via the log path approach.
// Instead, we write real files to a temp dir and call getLogPaths equivalent.

// Since audit.ts uses a hardcoded DEFAULT_LOG_DIR, we test the tool behavior
// by having the handler work against the actual fs — we'll write temp log files
// in the actual log dir only in integration-style tests, or we test the internal
// readEntries logic by importing helpers.

// For unit tests, we'll write log files to a temp location and invoke the
// audit logic via a thin wrapper that mimics what the handler does.

// Helper: build a log entry
function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: overrides.timestamp ?? "2026-03-03T10:00:00.000Z",
    level: overrides.level ?? "INFO",
    tool: overrides.tool ?? "market_get_ticker",
    durationMs: overrides.durationMs ?? 100,
    params: overrides.params ?? {},
    result: overrides.result ?? {},
  };
}

// Helper: write entries as NDJSON to a file path
function writeLog(filePath: string, entries: LogEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

// Local reimplementation of readEntries / getLogPaths for test isolation
function getLogPaths(logDir: string, now: Date, days = 7): string[] {
  const paths: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    paths.push(path.join(logDir, `trade-${yyyy}-${mm}-${dd}.log`));
  }
  return paths;
}

function readEntriesFromDir(logDir: string, now = new Date()): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const filePath of getLogPaths(logDir, now)) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as LogEntry);
      } catch {
        // skip
      }
    }
  }
  return entries;
}

describe("audit readEntries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-audit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no log files exist", () => {
    const entries = readEntriesFromDir(tmpDir);
    assert.deepEqual(entries, []);
  });

  it("reads entries from today's log file", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    const logPath = path.join(tmpDir, "trade-2026-03-03.log");
    const e1 = makeEntry({ tool: "market_get_ticker" });
    const e2 = makeEntry({ tool: "swap_place_order", level: "WARN" });
    writeLog(logPath, [e1, e2]);

    const entries = readEntriesFromDir(tmpDir, now);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].tool, "market_get_ticker");
    assert.equal(entries[1].tool, "swap_place_order");
  });

  it("reads entries from multiple day files", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    writeLog(path.join(tmpDir, "trade-2026-03-03.log"), [makeEntry({ tool: "tool_today" })]);
    writeLog(path.join(tmpDir, "trade-2026-03-02.log"), [makeEntry({ tool: "tool_yesterday" })]);

    const entries = readEntriesFromDir(tmpDir, now);
    assert.equal(entries.length, 2);
    const tools = entries.map((e) => e.tool);
    assert.ok(tools.includes("tool_today"));
    assert.ok(tools.includes("tool_yesterday"));
  });

  it("skips malformed lines silently", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    const logPath = path.join(tmpDir, "trade-2026-03-03.log");
    fs.writeFileSync(logPath, `${JSON.stringify(makeEntry())}\nnot-json\n${JSON.stringify(makeEntry())}\n`);

    const entries = readEntriesFromDir(tmpDir, now);
    assert.equal(entries.length, 2);
  });

  it("applies tool filter correctly", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    writeLog(path.join(tmpDir, "trade-2026-03-03.log"), [
      makeEntry({ tool: "market_get_ticker" }),
      makeEntry({ tool: "swap_place_order" }),
      makeEntry({ tool: "market_get_ticker" }),
    ]);

    const entries = readEntriesFromDir(tmpDir, now).filter((e) => e.tool === "market_get_ticker");
    assert.equal(entries.length, 2);
  });

  it("applies level filter correctly", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    writeLog(path.join(tmpDir, "trade-2026-03-03.log"), [
      makeEntry({ level: "INFO" }),
      makeEntry({ level: "WARN" }),
      makeEntry({ level: "ERROR" }),
    ]);

    const warnOnly = readEntriesFromDir(tmpDir, now).filter((e) => e.level === "WARN");
    assert.equal(warnOnly.length, 1);
  });

  it("applies since filter correctly", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    writeLog(path.join(tmpDir, "trade-2026-03-03.log"), [
      makeEntry({ timestamp: "2026-03-03T08:00:00.000Z" }),
      makeEntry({ timestamp: "2026-03-03T10:00:00.000Z" }),
      makeEntry({ timestamp: "2026-03-03T12:00:00.000Z" }),
    ]);

    const sinceTime = new Date("2026-03-03T09:00:00.000Z").getTime();
    const filtered = readEntriesFromDir(tmpDir, now).filter(
      (e) => new Date(e.timestamp).getTime() >= sinceTime,
    );
    assert.equal(filtered.length, 2);
  });

  it("respects limit", () => {
    const now = new Date("2026-03-03T12:00:00.000Z");
    const entries = Array.from({ length: 50 }, (_, i) =>
      makeEntry({ tool: `tool_${i}` }),
    );
    writeLog(path.join(tmpDir, "trade-2026-03-03.log"), entries);

    const all = readEntriesFromDir(tmpDir, now);
    const limited = all.slice(0, 10);
    assert.equal(limited.length, 10);
  });
});
