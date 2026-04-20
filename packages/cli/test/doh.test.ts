import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { printHelp } from "../src/help.js";
import { setOutput, resetOutput } from "../src/formatter.js";
import { handleDohCommand } from "../src/index.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "doh-cli-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Help tree — doh module must appear in global help
// ---------------------------------------------------------------------------

describe("printHelp() — doh module in global overview", () => {
  it("includes doh in module list", () => {
    const chunks: string[] = [];
    setOutput({ out: (m) => chunks.push(m), err: () => {} });
    try {
      printHelp();
    } finally {
      resetOutput();
    }
    const out = chunks.join("");
    assert.ok(out.includes("doh"), "global help should list doh module");
  });
});

describe('printHelp("doh") — doh module detail', () => {
  it("includes status, install, and remove commands", () => {
    const chunks: string[] = [];
    setOutput({ out: (m) => chunks.push(m), err: () => {} });
    try {
      printHelp("doh");
    } finally {
      resetOutput();
    }
    const out = chunks.join("");
    assert.ok(out.includes("status"), "should mention status command");
    assert.ok(out.includes("install"), "should mention install command");
    assert.ok(out.includes("remove"), "should mention remove command");
  });

  it("includes Usage lines", () => {
    const chunks: string[] = [];
    setOutput({ out: (m) => chunks.push(m), err: () => {} });
    try {
      printHelp("doh");
    } finally {
      resetOutput();
    }
    const out = chunks.join("");
    assert.ok(out.includes("okx doh"), "should include okx doh usage");
  });
});

// ---------------------------------------------------------------------------
// handleDohCommand routing
// ---------------------------------------------------------------------------

describe("handleDohCommand routing", () => {
  it("dispatches status action without error", async () => {
    const binaryPath = join(tempDir, "no-binary");
    // status with non-existent binary should print 'not installed' info
    let out = "";
    let err = "";
    setOutput({ out: (m) => { out += m; }, err: (m) => { err += m; } });
    try {
      await handleDohCommand("status", false, false, binaryPath);
    } finally {
      resetOutput();
    }
    // Should not throw; should produce no error output
    assert.equal(err.length, 0, "should produce no error output");
  });

  it("dispatches remove action on non-existent binary without error", async () => {
    const binaryPath = join(tempDir, "no-binary");
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      // force=true to skip confirmation
      await handleDohCommand("remove", false, true, binaryPath);
    } finally {
      resetOutput();
    }
    assert.ok(out.includes("not installed"), "should report binary not installed");
  });

  it("dispatches remove action on existing binary with --force", async () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("fake binary"));
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      await handleDohCommand("remove", false, true, binaryPath);
    } finally {
      resetOutput();
    }
    assert.ok(out.includes("removed") || out.includes("Removed"), "should confirm removal");
  });

  it("sets exitCode=1 for unknown doh action", async () => {
    const origCode = process.exitCode;
    let err = "";
    setOutput({ out: () => {}, err: (m) => { err += m; } });
    try {
      await handleDohCommand("unknown-action", false, false);
    } finally {
      resetOutput();
    }
    assert.ok(err.includes("Unknown") || process.exitCode === 1, "should report unknown action");
    process.exitCode = origCode;
  });
});

// ---------------------------------------------------------------------------
// handleDohCommand — status with --json
// ---------------------------------------------------------------------------

describe("handleDohCommand — status --json", () => {
  it("returns valid JSON when binary does not exist", async () => {
    const binaryPath = join(tempDir, "no-binary");
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      await handleDohCommand("status", true, false, binaryPath);
    } finally {
      resetOutput();
    }
    const parsed = JSON.parse(out);
    assert.equal(parsed.exists, false);
    assert.equal(parsed.binaryPath, binaryPath);
    assert.equal(parsed.cdnMatch, "not-installed");
    assert.equal(parsed.sha256, null);
    assert.equal(parsed.fileSize, null);
    assert.ok("runtimeMode" in parsed);
  });

  it("returns valid JSON with exists=true when binary is present", async () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("fake-binary-for-status-json"));
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      await handleDohCommand("status", true, false, binaryPath);
    } finally {
      resetOutput();
    }
    const parsed = JSON.parse(out);
    assert.equal(parsed.exists, true);
    assert.equal(parsed.binaryPath, binaryPath);
    assert.ok(typeof parsed.sha256 === "string" && parsed.sha256.length === 64);
    assert.ok(typeof parsed.fileSize === "number" && parsed.fileSize > 0);
    // cdnMatch will be "unavailable" since no real CDN is reachable in tests (short timeout)
    assert.ok(["match", "mismatch", "unavailable"].includes(parsed.cdnMatch));
  });
});

// ---------------------------------------------------------------------------
// handleDohCommand — status with existing binary (text mode)
// ---------------------------------------------------------------------------

describe("handleDohCommand — status with existing binary (text)", () => {
  it("shows 'Installed   : yes' for an existing binary", async () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("status-text-binary"));
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      await handleDohCommand("status", false, false, binaryPath);
    } finally {
      resetOutput();
    }
    assert.ok(out.includes("yes"), "should show 'yes' for installed binary");
    assert.ok(out.includes("Binary path"), "should show binary path label");
    assert.ok(out.includes("SHA-256"), "should show SHA-256 label");
  });
});

// ---------------------------------------------------------------------------
// handleDohCommand — install --json with empty sources
// ---------------------------------------------------------------------------

describe("handleDohCommand — install --json", () => {
  it("returns valid JSON output with expected shape", async () => {
    const binaryPath = join(tempDir, "okx-pilot");
    let out = "";
    const origCode = process.exitCode;
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      // installDohBinary with default CDN sources — may succeed or fail depending on network
      await handleDohCommand("install", true, false, binaryPath);
    } finally {
      resetOutput();
    }
    const parsed = JSON.parse(out);
    // Regardless of success/failure, JSON shape must be correct
    assert.ok(["installed", "up-to-date", "failed"].includes(parsed.status), `unexpected status: ${parsed.status}`);
    assert.ok("source" in parsed, "should have source field");
    assert.ok("error" in parsed, "should have error field");
    assert.ok(Array.isArray(parsed.messages), "should contain messages array");
    if (parsed.status === "failed") {
      assert.equal(process.exitCode, 1);
    }
    process.exitCode = origCode;
  });

  it("install without --json prints text output", async () => {
    const binaryPath = join(tempDir, "okx-pilot");
    let out = "";
    let err = "";
    const origCode = process.exitCode;
    setOutput({ out: (m) => { out += m; }, err: (m) => { err += m; } });
    try {
      await handleDohCommand("install", false, false, binaryPath);
    } finally {
      resetOutput();
    }
    // Should show installation text output (either success or failure)
    assert.ok(
      out.includes("Installing") || out.includes("installed") || out.includes("up to date") ||
      err.includes("failed") || err.includes("Failed"),
      "should show installation progress or result"
    );
    process.exitCode = origCode;
  });
});

// ---------------------------------------------------------------------------
// handleDohCommand — remove --json
// ---------------------------------------------------------------------------

describe("handleDohCommand — remove --json", () => {
  it("returns JSON with status=not-installed when binary absent", async () => {
    const binaryPath = join(tempDir, "no-binary");
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      await handleDohCommand("remove", true, true, binaryPath);
    } finally {
      resetOutput();
    }
    const parsed = JSON.parse(out);
    assert.equal(parsed.status, "not-installed");
  });

  it("returns JSON with status=removed when binary exists and --force", async () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("remove-json-binary"));
    let out = "";
    setOutput({ out: (m) => { out += m; }, err: () => {} });
    try {
      await handleDohCommand("remove", true, true, binaryPath);
    } finally {
      resetOutput();
    }
    const parsed = JSON.parse(out);
    assert.equal(parsed.status, "removed");
    assert.equal(parsed.path, binaryPath);
  });
});
