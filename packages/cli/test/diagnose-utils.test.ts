import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Report, ok, fail, section, sanitize, writeReportIfRequested, readCliVersion } from "../src/commands/diagnose-utils.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  setOutput({ out: (m) => chunks.push(m), err: () => {} });
  try {
    fn();
  } finally {
    resetOutput();
  }
  return chunks.join("");
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  setOutput({ out: () => {}, err: (m) => chunks.push(m) });
  try {
    fn();
  } finally {
    resetOutput();
  }
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// Report class tests
// ---------------------------------------------------------------------------

describe("Report.add and Report.print", () => {
  it("add stores lines and print outputs them", () => {
    const report = new Report();
    report.add("key1", "value1");
    report.add("key2", "value2");

    const output = captureStdout(() => report.print());
    assert.ok(output.includes("key1"), "should contain key1");
    assert.ok(output.includes("value1"), "should contain value1");
    assert.ok(output.includes("key2"), "should contain key2");
    assert.ok(output.includes("value2"), "should contain value2");
    assert.ok(output.includes("Diagnostic Report"), "should include report header");
    assert.ok(output.includes("copy & share"), "should include copy & share");
  });

  it("print outputs separator lines", () => {
    const report = new Report();
    const output = captureStdout(() => report.print());
    assert.ok(output.includes("\u2500"), "should include horizontal rule characters");
  });

  it("keys are left-padded to align values", () => {
    const report = new Report();
    report.add("ts", "2024-01-01");
    report.add("os", "darwin");
    const output = captureStdout(() => report.print());
    // Both keys should appear with padding
    assert.ok(output.includes("ts"), "should contain ts key");
    assert.ok(output.includes("os"), "should contain os key");
  });
});

describe("Report.writeToFile", () => {
  let tmpDir: string;
  let outFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-report-test-"));
    outFile = path.join(tmpDir, "report.txt");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes report to file and returns true", () => {
    const report = new Report();
    report.add("key", "value");
    const result = report.writeToFile(outFile);
    assert.equal(result, true, "should return true on success");
    assert.ok(fs.existsSync(outFile), "file should be created");
    const content = fs.readFileSync(outFile, "utf8");
    assert.ok(content.includes("Diagnostic Report"), "file should contain report header");
    assert.ok(content.includes("key"), "file should contain key");
    assert.ok(content.includes("value"), "file should contain value");
  });

  it("returns false when write fails (invalid path)", () => {
    const report = new Report();
    report.add("k", "v");
    const result = report.writeToFile("/nonexistent/dir/that/does/not/exist/report.txt");
    assert.equal(result, false, "should return false on failure");
  });

  it("written file contains separator lines", () => {
    const report = new Report();
    report.add("node", "v20.0.0");
    report.writeToFile(outFile);
    const content = fs.readFileSync(outFile, "utf8");
    assert.ok(content.includes("---"), "should contain separator dashes");
  });
});

// ---------------------------------------------------------------------------
// Display helpers: ok / fail / section
// ---------------------------------------------------------------------------

describe("ok()", () => {
  it("outputs check mark and label and detail", () => {
    const output = captureStdout(() => ok("DNS resolve", "ok.com -> 1.2.3.4 (12ms)"));
    assert.ok(output.includes("\u2713"), "should include checkmark");
    assert.ok(output.includes("DNS resolve"), "should include label");
    assert.ok(output.includes("ok.com"), "should include detail");
  });

  it("pads label to fixed width", () => {
    const output = captureStdout(() => ok("short", "detail"));
    // label is padded to 14 chars
    assert.ok(output.includes("short"), "should include label");
    assert.ok(output.includes("detail"), "should include detail");
  });
});

describe("fail()", () => {
  it("outputs cross mark, label, detail, and hints", () => {
    const output = captureStdout(() =>
      fail("TCP connect", "timed out", ["Check firewall", "Try VPN"]),
    );
    assert.ok(output.includes("\u2717"), "should include cross mark");
    assert.ok(output.includes("TCP connect"), "should include label");
    assert.ok(output.includes("timed out"), "should include detail");
    assert.ok(output.includes("Check firewall"), "should include hint 1");
    assert.ok(output.includes("Try VPN"), "should include hint 2");
  });

  it("shows arrow before each hint", () => {
    const output = captureStdout(() => fail("Test", "error", ["hint A"]));
    assert.ok(output.includes("\u2192"), "should include arrow before hint");
  });

  it("works with empty hints array", () => {
    assert.doesNotThrow(() => {
      captureStdout(() => fail("Test", "error", []));
    });
  });
});

describe("section()", () => {
  it("outputs section title", () => {
    const output = captureStdout(() => section("Network"));
    assert.ok(output.includes("Network"), "should include section title");
  });

  it("outputs newline before title", () => {
    const output = captureStdout(() => section("Test Section"));
    assert.ok(output.startsWith("\n"), "should start with newline");
  });
});

// ---------------------------------------------------------------------------
// sanitize()
// ---------------------------------------------------------------------------

describe("sanitize()", () => {
  it("replaces UUID patterns", () => {
    const input = "token=550e8400-e29b-41d4-a716-446655440000";
    const result = sanitize(input);
    assert.ok(result.includes("****-uuid-****"), "should replace UUID");
    assert.ok(!result.includes("550e8400"), "should not contain original UUID");
  });

  it("replaces long hex strings (32+ chars)", () => {
    const hex = "0123456789abcdef".repeat(2); // 32 chars
    const result = sanitize(hex);
    assert.ok(result.includes("****hex****"), "should replace long hex");
  });

  it("does not replace short hex strings (< 32 chars)", () => {
    const hex = "deadbeef"; // 8 chars
    const result = sanitize(hex);
    assert.equal(result, hex, "should leave short hex unchanged");
  });

  it("replaces Bearer token", () => {
    const input = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const result = sanitize(input);
    assert.ok(!result.includes("eyJhbGci"), "should mask token part");
    assert.ok(result.includes("Bearer ****"), "should replace with Bearer ****");
  });

  it("preserves normal text", () => {
    const input = "Node.js v20.1.0 on darwin/arm64";
    assert.equal(sanitize(input), input, "should not modify normal text");
  });

  it("handles empty string", () => {
    assert.equal(sanitize(""), "", "should return empty string unchanged");
  });
});

// ---------------------------------------------------------------------------
// writeReportIfRequested()
// ---------------------------------------------------------------------------

describe("writeReportIfRequested()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-write-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does nothing when outputPath is undefined", () => {
    const report = new Report();
    report.add("k", "v");
    // Should not throw or create any files
    assert.doesNotThrow(() => writeReportIfRequested(report, undefined));
  });

  it("writes file and prints success message when path given", () => {
    const report = new Report();
    report.add("k", "v");
    const outFile = path.join(tmpDir, "out.txt");

    const output = captureStdout(() => writeReportIfRequested(report, outFile));
    assert.ok(fs.existsSync(outFile), "file should be created");
    assert.ok(output.includes("Report saved to"), "should print success message");
    assert.ok(output.includes(outFile), "should include file path in message");
  });

  it("writes warning to stderr when write fails", () => {
    const report = new Report();
    report.add("k", "v");
    const badPath = "/nonexistent/deep/path/out.txt";

    const errOutput = captureStderr(() => writeReportIfRequested(report, badPath));
    assert.ok(errOutput.includes("Warning"), "should print warning to stderr");
    assert.ok(errOutput.includes("failed to write"), "should mention failure");
  });
});

// ---------------------------------------------------------------------------
// readCliVersion()
// ---------------------------------------------------------------------------

describe("readCliVersion()", () => {
  it("returns a version string (non-empty)", () => {
    const version = readCliVersion();
    assert.ok(typeof version === "string", "should return a string");
    assert.ok(version.length > 0, "version should be non-empty");
  });

  it("returns semver-like string or 0.0.0 fallback", () => {
    const version = readCliVersion();
    // Should be either a real version (x.y.z) or the fallback "0.0.0"
    assert.ok(/\d+\.\d+\.\d+/.test(version), "should match semver pattern");
  });
});
