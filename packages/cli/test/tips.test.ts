import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { showFirstRunTips } from "../src/tips.js";

describe("showFirstRunTips", () => {
  let tmpHome: string;
  let origHome: string;
  let stderrChunks: string[];
  let origWrite: typeof process.stderr.write;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "okx-tips-test-"));
    origHome = process.env.HOME!;
    process.env.HOME = tmpHome;

    stderrChunks = [];
    origWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = origWrite;
    process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("shows bilingual tips on first run", () => {
    showFirstRunTips("1.2.3");
    const output = stderrChunks.join("");
    assert.match(output, /Security Tips/);
    assert.match(output, /安全提示/);
    assert.match(output, /1\.2\.3/);
  });

  it("creates marker file ~/.okx/.tips-shown", () => {
    showFirstRunTips("1.0.0");
    assert.ok(existsSync(join(tmpHome, ".okx", ".tips-shown")));
  });

  it("does NOT show tips when marker already exists", () => {
    mkdirSync(join(tmpHome, ".okx"), { recursive: true });
    writeFileSync(join(tmpHome, ".okx", ".tips-shown"), "exists\n");

    showFirstRunTips("1.0.0");
    const output = stderrChunks.join("");
    assert.equal(output, "", "No output expected when marker exists");
  });

  it("does not throw when marker write fails", () => {
    // Point HOME to a non-existent deeply nested path so mkdirSync might behave unexpectedly,
    // but the function should not throw thanks to the try/catch.
    process.env.HOME = join(tmpHome, "\0invalid");
    assert.doesNotThrow(() => showFirstRunTips("1.0.0"));
  });
});
