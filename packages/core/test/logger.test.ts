import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TradeLogger, pruneOldLogs } from "../src/utils/logger.js";

describe("TradeLogger.sanitize", () => {
  it("removes apiKey from flat object", () => {
    const result = TradeLogger.sanitize({ apiKey: "abc123", instId: "BTC-USDT" });
    assert.deepEqual(result, { apiKey: "[REDACTED]", instId: "BTC-USDT" });
  });

  it("removes secretKey from flat object", () => {
    const result = TradeLogger.sanitize({ secretKey: "secret", other: "value" });
    assert.deepEqual(result, { secretKey: "[REDACTED]", other: "value" });
  });

  it("removes passphrase from flat object", () => {
    const result = TradeLogger.sanitize({ passphrase: "pass123" });
    assert.deepEqual(result, { passphrase: "[REDACTED]" });
  });

  it("removes nested sensitive fields", () => {
    const result = TradeLogger.sanitize({
      config: { apiKey: "nested-key", timeout: 5000 },
      instId: "BTC-USDT",
    });
    assert.deepEqual(result, {
      config: { apiKey: "[REDACTED]", timeout: 5000 },
      instId: "BTC-USDT",
    });
  });

  it("handles arrays", () => {
    const result = TradeLogger.sanitize([{ apiKey: "k1" }, { instId: "ETH-USDT" }]);
    assert.deepEqual(result, [{ apiKey: "[REDACTED]" }, { instId: "ETH-USDT" }]);
  });

  it("returns primitives as-is", () => {
    assert.equal(TradeLogger.sanitize("hello"), "hello");
    assert.equal(TradeLogger.sanitize(42), 42);
    assert.equal(TradeLogger.sanitize(null), null);
  });
});

describe("TradeLogger.getLogPath", () => {
  it("returns trade-YYYY-MM-DD.log in the log dir", () => {
    const logger = new TradeLogger("info", "/tmp/test-logs");
    const d = new Date("2026-03-03T00:00:00.000Z");
    assert.equal(logger.getLogPath(d), "/tmp/test-logs/trade-2026-03-03.log");
  });

  it("uses UTC date in filename", () => {
    const logger = new TradeLogger("info", "/tmp/test-logs");
    const d = new Date("2026-01-09T23:59:59.999Z");
    assert.equal(logger.getLogPath(d), "/tmp/test-logs/trade-2026-01-09.log");
  });
});

describe("TradeLogger log level filtering", () => {
  let tmpDir: string;
  let appendCalls: string[];
  let originalAppend: typeof fs.appendFileSync;
  let originalMkdir: typeof fs.mkdirSync;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-test-"));
    appendCalls = [];
    originalAppend = fs.appendFileSync;
    originalMkdir = fs.mkdirSync;
    // @ts-expect-error - mock override
    fs.appendFileSync = (_path: unknown, data: unknown) => {
      appendCalls.push(String(data));
    };
    // @ts-expect-error - mock override
    fs.mkdirSync = () => {};
  });

  afterEach(() => {
    fs.appendFileSync = originalAppend;
    fs.mkdirSync = originalMkdir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("warn logger skips info entries", () => {
    const logger = new TradeLogger("warn", tmpDir);
    logger.log("info", "market_get_ticker", {}, { ok: true }, 50);
    assert.equal(appendCalls.length, 0);
  });

  it("warn logger writes warn entries", () => {
    const logger = new TradeLogger("warn", tmpDir);
    logger.log("warn", "swap_place_order", { instId: "BTC-USDT-SWAP" }, { error: true }, 100);
    assert.equal(appendCalls.length, 1);
    const entry = JSON.parse(appendCalls[0]) as Record<string, unknown>;
    assert.equal(entry["level"], "WARN");
  });

  it("warn logger writes error entries", () => {
    const logger = new TradeLogger("warn", tmpDir);
    logger.log("error", "swap_place_order", {}, new Error("fail"), 100);
    assert.equal(appendCalls.length, 1);
    const entry = JSON.parse(appendCalls[0]) as Record<string, unknown>;
    assert.equal(entry["level"], "ERROR");
  });

  it("error logger skips warn entries", () => {
    const logger = new TradeLogger("error", tmpDir);
    logger.log("warn", "some_tool", {}, {}, 50);
    assert.equal(appendCalls.length, 0);
  });
});

describe("TradeLogger.log writes correct NDJSON", () => {
  let appendCalls: string[];
  let originalAppend: typeof fs.appendFileSync;
  let originalMkdir: typeof fs.mkdirSync;

  beforeEach(() => {
    appendCalls = [];
    originalAppend = fs.appendFileSync;
    originalMkdir = fs.mkdirSync;
    // @ts-expect-error - mock override
    fs.appendFileSync = (_path: unknown, data: unknown) => {
      appendCalls.push(String(data));
    };
    // @ts-expect-error - mock override
    fs.mkdirSync = () => {};
  });

  afterEach(() => {
    fs.appendFileSync = originalAppend;
    fs.mkdirSync = originalMkdir;
  });

  it("writes a valid NDJSON line ending with newline", () => {
    const logger = new TradeLogger("info", "/tmp/logs");
    logger.log("info", "market_get_ticker", { instId: "BTC-USDT" }, { price: "50000" }, 120);
    assert.equal(appendCalls.length, 1);
    assert.ok(appendCalls[0].endsWith("\n"));
    const entry = JSON.parse(appendCalls[0]) as Record<string, unknown>;
    assert.equal(entry["level"], "INFO");
    assert.equal(entry["tool"], "market_get_ticker");
    assert.equal(entry["durationMs"], 120);
    assert.ok(typeof entry["timestamp"] === "string");
  });

  it("redacts sensitive params before writing", () => {
    const logger = new TradeLogger("info", "/tmp/logs");
    logger.log("info", "some_tool", { apiKey: "secret", instId: "BTC-USDT" }, {}, 10);
    const entry = JSON.parse(appendCalls[0]) as Record<string, unknown>;
    const params = entry["params"] as Record<string, unknown>;
    assert.equal(params["apiKey"], "[REDACTED]");
    assert.equal(params["instId"], "BTC-USDT");
  });

  it("silent fail when appendFileSync throws", () => {
    // @ts-expect-error - mock override
    fs.appendFileSync = () => { throw new Error("disk full"); };
    const logger = new TradeLogger("info", "/tmp/logs");
    assert.doesNotThrow(() => {
      logger.log("info", "some_tool", {}, {}, 10);
    });
  });
});

describe("pruneOldLogs", () => {
  let tmpDir: string;
  const NOW = 1746700800000; // fixed synthetic timestamp (2025-05-08T16:00:00Z)

  function makeLogFile(name: string, mtimeMs: number): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, "log content", "utf8");
    const mtime = new Date(mtimeMs);
    fs.utimesSync(filePath, mtime, mtime);
    return filePath;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-prune-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sweep runs and writes marker when no marker file exists", () => {
    const oldFile = makeLogFile("trade-2026-01-01.log", NOW - 31 * 86400000 - 1);
    pruneOldLogs(tmpDir, 30, NOW);
    assert.equal(fs.existsSync(oldFile), false, "old file should be deleted");
    const markerPath = path.join(tmpDir, ".last-prune.json");
    assert.ok(fs.existsSync(markerPath), "marker should be written");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { checkedAt: number };
    assert.equal(marker.checkedAt, NOW);
  });

  it("no sweep when marker checkedAt is within 24h", () => {
    const markerPath = path.join(tmpDir, ".last-prune.json");
    fs.writeFileSync(markerPath, JSON.stringify({ checkedAt: NOW - 3600000 }), "utf8");
    const oldFile = makeLogFile("trade-recent-marker.log", NOW - 31 * 86400000 - 1);
    pruneOldLogs(tmpDir, 30, NOW);
    assert.ok(fs.existsSync(oldFile), "file should NOT be deleted when sweep is throttled");
  });

  it("sweep runs and updates marker when marker is older than 24h", () => {
    const markerPath = path.join(tmpDir, ".last-prune.json");
    fs.writeFileSync(markerPath, JSON.stringify({ checkedAt: NOW - 25 * 3600000 }), "utf8");
    const oldFile = makeLogFile("trade-stale-marker.log", NOW - 31 * 86400000 - 1);
    pruneOldLogs(tmpDir, 30, NOW);
    assert.equal(fs.existsSync(oldFile), false, "old file should be deleted");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { checkedAt: number };
    assert.equal(marker.checkedAt, NOW, "marker should be updated to NOW");
  });

  it("keeps file at exactly retention boundary, deletes file 1ms past boundary", () => {
    const keepFile = makeLogFile("trade-boundary-keep.log", NOW - 30 * 86400000);
    const deleteFile = makeLogFile("trade-boundary-delete.log", NOW - 30 * 86400000 - 1);
    pruneOldLogs(tmpDir, 30, NOW);
    assert.ok(fs.existsSync(keepFile), "file at exact boundary should be kept");
    assert.equal(fs.existsSync(deleteFile), false, "file 1ms past boundary should be deleted");
  });

  it("respects retentionDays=7 override", () => {
    const keepFile = makeLogFile("trade-within-7d.log", NOW - 6 * 86400000);
    const deleteFile = makeLogFile("trade-older-7d.log", NOW - 8 * 86400000);
    pruneOldLogs(tmpDir, 7, NOW);
    assert.ok(fs.existsSync(keepFile), "file within 7 days should be kept");
    assert.equal(fs.existsSync(deleteFile), false, "file older than 7 days should be deleted");
  });

  it("retentionDays=0 skips sweep entirely and does not write marker", () => {
    const oldFile = makeLogFile("trade-retention-zero.log", NOW - 31 * 86400000 - 1);
    pruneOldLogs(tmpDir, 0, NOW);
    assert.ok(fs.existsSync(oldFile), "file should NOT be deleted when retentionDays=0");
    const markerPath = path.join(tmpDir, ".last-prune.json");
    assert.equal(fs.existsSync(markerPath), false, "marker should NOT be written when retentionDays=0");
  });

  it("corrupt marker JSON causes sweep to run as if absent", () => {
    const markerPath = path.join(tmpDir, ".last-prune.json");
    fs.writeFileSync(markerPath, "not valid json {{", "utf8");
    const oldFile = makeLogFile("trade-corrupt-marker.log", NOW - 31 * 86400000 - 1);
    pruneOldLogs(tmpDir, 30, NOW);
    assert.equal(fs.existsSync(oldFile), false, "old file should be deleted despite corrupt marker");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { checkedAt: number };
    assert.equal(marker.checkedAt, NOW, "marker should be updated after sweep");
  });

  it("swallows per-file unlinkSync error and still writes marker", () => {
    const originalUnlink = fs.unlinkSync;
    const file1 = makeLogFile("trade-unlink-fail.log", NOW - 31 * 86400000 - 1);
    const file2 = makeLogFile("trade-unlink-ok.log", NOW - 31 * 86400000 - 1);
    // @ts-expect-error - mock override
    fs.unlinkSync = (p: fs.PathLike) => {
      if (String(p).endsWith("trade-unlink-fail.log")) throw new Error("permission denied");
      originalUnlink(p);
    };
    try {
      assert.doesNotThrow(() => pruneOldLogs(tmpDir, 30, NOW));
      assert.equal(fs.existsSync(file2), false, "second file should be deleted");
      const markerPath = path.join(tmpDir, ".last-prune.json");
      assert.ok(fs.existsSync(markerPath), "marker should be written despite partial failure");
    } finally {
      fs.unlinkSync = originalUnlink;
    }
  });
});
