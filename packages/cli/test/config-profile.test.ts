/**
 * Unit tests for config profile management commands:
 * - parseSiteKey extended (name-based input)
 * - inferSiteFromBaseUrl
 * - maskSecret
 * - cmdConfigAddProfile
 * - cmdConfigListProfile
 * - cmdConfigUse
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseSiteKey,
  inferSiteFromBaseUrl,
  maskSecret,
  cmdConfigAddProfile,
  cmdConfigListProfile,
  cmdConfigUse,
} from "../src/commands/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  const restore = () => { process.stdout.write = orig; };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { restore(); return chunks.join(""); }, (e) => { restore(); throw e; });
    }
  } catch (e) {
    restore();
    throw e;
  }
  restore();
  return Promise.resolve(chunks.join(""));
}

function captureStderr(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  const restore = () => { process.stderr.write = orig; };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { restore(); return chunks.join(""); }, (e) => { restore(); throw e; });
    }
  } catch (e) {
    restore();
    throw e;
  }
  restore();
  return Promise.resolve(chunks.join(""));
}

// ---------------------------------------------------------------------------
// parseSiteKey — extended to accept name-based input
// ---------------------------------------------------------------------------
describe("parseSiteKey (extended)", () => {
  it('accepts "global" string directly', () => {
    assert.equal(parseSiteKey("global"), "global");
  });

  it('accepts "eea" string directly', () => {
    assert.equal(parseSiteKey("eea"), "eea");
  });

  it('accepts "us" string directly', () => {
    assert.equal(parseSiteKey("us"), "us");
  });

  it('accepts "Global" case-insensitively', () => {
    assert.equal(parseSiteKey("Global"), "global");
  });

  it('accepts "EEA" case-insensitively', () => {
    assert.equal(parseSiteKey("EEA"), "eea");
  });

  it('accepts "US" case-insensitively', () => {
    assert.equal(parseSiteKey("US"), "us");
  });

  // Existing numeric inputs still work
  it('still maps "1" to "global"', () => {
    assert.equal(parseSiteKey("1"), "global");
  });

  it('still maps "2" to "eea"', () => {
    assert.equal(parseSiteKey("2"), "eea");
  });

  it('still maps "3" to "us"', () => {
    assert.equal(parseSiteKey("3"), "us");
  });
});

// ---------------------------------------------------------------------------
// inferSiteFromBaseUrl
// ---------------------------------------------------------------------------
describe("inferSiteFromBaseUrl", () => {
  it("returns global for www.okx.com base URL", () => {
    assert.equal(inferSiteFromBaseUrl("https://www.okx.com"), "global");
  });

  it("returns eea for my.okx.com (EEA webUrl)", () => {
    assert.equal(inferSiteFromBaseUrl("https://my.okx.com"), "eea");
  });

  it("returns us for app.okx.com", () => {
    assert.equal(inferSiteFromBaseUrl("https://app.okx.com"), "us");
  });

  it("returns global for undefined", () => {
    assert.equal(inferSiteFromBaseUrl(undefined), "global");
  });

  it("returns global for unknown URL", () => {
    assert.equal(inferSiteFromBaseUrl("https://unknown.example.com"), "global");
  });
});

// ---------------------------------------------------------------------------
// maskSecret
// ---------------------------------------------------------------------------
describe("maskSecret", () => {
  it("returns **** for undefined", () => {
    assert.equal(maskSecret(undefined), "****");
  });

  it("returns **** for empty string", () => {
    assert.equal(maskSecret(""), "****");
  });

  it("returns **** for strings shorter than 4 chars", () => {
    assert.equal(maskSecret("abc"), "****");
  });

  it("returns ***xxxx for 4-char string", () => {
    assert.equal(maskSecret("abcd"), "***abcd");
  });

  it("returns ***<last4> for longer strings", () => {
    assert.equal(maskSecret("abcdefgh"), "***efgh");
  });
});

// ---------------------------------------------------------------------------
// cmdConfigAddProfile / cmdConfigListProfile / cmdConfigUse
// ---------------------------------------------------------------------------
describe("config profile commands (with tmp HOME)", () => {
  let tmpDir: string;
  let origHome: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-profile-test-"));
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean up config file before each test
    const cfgDir = path.join(tmpDir, ".okx");
    if (fs.existsSync(cfgDir)) {
      fs.rmSync(cfgDir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // cmdConfigAddProfile — success cases
  // -----------------------------------------------------------------------
  it("creates a new profile with all params", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=myapikey", "SK=mysecret", "PP=mypass", "site=eea", "demo=false", "name=myprofile"], false)
    );
    const cfgPath = path.join(tmpDir, ".okx", "config.toml");
    assert.ok(fs.existsSync(cfgPath), "config.toml should be created");
    const content = fs.readFileSync(cfgPath, "utf8");
    assert.ok(content.includes("myprofile"), "profile name should be in config");
    assert.ok(content.includes("myapikey"), "api_key should be in config");
    assert.ok(content.includes("default_profile"), "default_profile should be set");
    process.exitCode = origCode;
  });

  it("sets default name to 'demo' when demo=true (default)", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1"], false)
    );
    const content = fs.readFileSync(path.join(tmpDir, ".okx", "config.toml"), "utf8");
    assert.ok(content.includes("[profiles.demo]"), "default demo profile name should be 'demo'");
    process.exitCode = origCode;
  });

  it("sets default name to 'live' when demo=false", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "demo=false"], false)
    );
    const content = fs.readFileSync(path.join(tmpDir, ".okx", "config.toml"), "utf8");
    assert.ok(content.includes("[profiles.live]"), "default live profile name should be 'live'");
    process.exitCode = origCode;
  });

  it("sets site field on the profile", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "site=us", "name=myus"], false)
    );
    const content = fs.readFileSync(path.join(tmpDir, ".okx", "config.toml"), "utf8");
    assert.ok(content.includes('site = "us"'), "site field should be written to config");
    process.exitCode = origCode;
  });

  it("handles passphrase with special characters (=)", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=p@ss=word!#", "name=special"], false)
    );
    const content = fs.readFileSync(path.join(tmpDir, ".okx", "config.toml"), "utf8");
    assert.ok(content.includes("p@ss=word!#"), "passphrase with special chars should be preserved");
    process.exitCode = origCode;
  });

  // -----------------------------------------------------------------------
  // cmdConfigAddProfile — conflict handling
  // -----------------------------------------------------------------------
  it("fails with exit code 1 on name conflict without --force", async () => {
    const origCode = process.exitCode;
    // First creation
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "name=conflict"], false)
    );
    // Reset exitCode
    process.exitCode = origCode;

    // Second attempt without --force
    const err = await captureStderr(() =>
      cmdConfigAddProfile(["AK=ak2", "SK=sk2", "PP=pp2", "name=conflict"], false)
    );
    assert.ok(err.includes("conflict") || err.includes("exists") || err.includes("already"), "should report conflict");
    assert.equal(process.exitCode, 1, "exit code should be 1");
    process.exitCode = origCode;
  });

  it("overwrites on name conflict with --force", async () => {
    const origCode = process.exitCode;
    // First creation
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "name=forced"], false)
    );
    // Force update with different api key
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak_new", "SK=sk1", "PP=pp1", "name=forced"], true)
    );
    const content = fs.readFileSync(path.join(tmpDir, ".okx", "config.toml"), "utf8");
    assert.ok(content.includes("ak_new"), "api_key should be updated with --force");
    process.exitCode = origCode;
  });

  // -----------------------------------------------------------------------
  // cmdConfigAddProfile — missing required fields
  // -----------------------------------------------------------------------
  it("reports error and sets exit code for missing AK", async () => {
    const origCode = process.exitCode;
    const err = await captureStderr(() =>
      cmdConfigAddProfile(["SK=sk1", "PP=pp1"], false)
    );
    assert.ok(err.includes("AK") || err.includes("api_key") || err.includes("required") || err.includes("missing"), "should mention missing AK");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  it("reports error and sets exit code for missing SK", async () => {
    const origCode = process.exitCode;
    const err = await captureStderr(() =>
      cmdConfigAddProfile(["AK=ak1", "PP=pp1"], false)
    );
    assert.ok(err.includes("SK") || err.includes("secret_key") || err.includes("required") || err.includes("missing"), "should mention missing SK");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  it("reports error and sets exit code for missing PP", async () => {
    const origCode = process.exitCode;
    const err = await captureStderr(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1"], false)
    );
    assert.ok(err.includes("PP") || err.includes("passphrase") || err.includes("required") || err.includes("missing"), "should mention missing PP");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  // -----------------------------------------------------------------------
  // cmdConfigListProfile
  // -----------------------------------------------------------------------
  it("lists profiles with masked secrets and marks default", async () => {
    const origCode = process.exitCode;
    // Create two profiles
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=apikey1234", "SK=secretkey1", "PP=passphrase1", "name=alpha", "site=global"], false)
    );
    process.exitCode = origCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=apikey5678", "SK=secretkey2", "PP=passphrase2", "name=beta", "site=eea", "demo=false"], false)
    );
    process.exitCode = origCode;

    const out = await captureStdout(() => cmdConfigListProfile());
    assert.ok(out.includes("alpha"), "should list profile alpha");
    assert.ok(out.includes("beta"), "should list profile beta");
    // Should NOT show full secret
    assert.ok(!out.includes("secretkey1"), "should not show full secret_key");
    assert.ok(!out.includes("passphrase1"), "should not show full passphrase");
    // Should show masked value (***xxxx format)
    assert.ok(out.includes("***"), "should show masked values");
    // Should mark default profile
    assert.ok(out.includes("*"), "should mark default profile");
    // Should show site info
    assert.ok(out.includes("global") || out.includes("eea"), "should show site");
    process.exitCode = origCode;
  });

  it("shows mode (demo/live) in list", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "name=demoone", "demo=true"], false)
    );
    process.exitCode = origCode;

    const out = await captureStdout(() => cmdConfigListProfile());
    assert.ok(out.includes("demo") || out.includes("模拟"), "should show demo mode label");
    process.exitCode = origCode;
  });

  // -----------------------------------------------------------------------
  // cmdConfigUse
  // -----------------------------------------------------------------------
  it("switches default profile", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "name=p1"], false)
    );
    process.exitCode = origCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak2", "SK=sk2", "PP=pp2", "name=p2"], false)
    );
    process.exitCode = origCode;

    await captureStdout(() => cmdConfigUse("p1"));
    const content = fs.readFileSync(path.join(tmpDir, ".okx", "config.toml"), "utf8");
    assert.ok(content.includes('default_profile = "p1"'), "default_profile should be p1");
    process.exitCode = origCode;
  });

  it("fails with exit code 1 for non-existent profile in use command", async () => {
    const origCode = process.exitCode;
    await captureStdout(() =>
      cmdConfigAddProfile(["AK=ak1", "SK=sk1", "PP=pp1", "name=existing"], false)
    );
    process.exitCode = origCode;

    const err = await captureStderr(() => cmdConfigUse("nonexistent"));
    assert.ok(err.includes("nonexistent") || err.includes("not found") || err.includes("does not exist"), "should report missing profile");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });
});
