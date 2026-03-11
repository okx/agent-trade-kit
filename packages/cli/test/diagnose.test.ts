import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { OkxConfig } from "@agent-tradekit/core";
import { cmdDiagnose } from "../src/commands/diagnose.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG: OkxConfig = {
  hasAuth: false,
  baseUrl: "https://www.okx.com",
  timeoutMs: 5000,
  modules: ["market"],
  readOnly: false,
  demo: false,
  site: "global",
  sourceTag: "test",
  verbose: false,
};

interface CaptureResult { output: string; exitCode: number | undefined }

/** Capture stdout writes and exitCode during a callback. */
async function captureStdout(fn: () => Promise<void>): Promise<CaptureResult> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  const savedExitCode = process.exitCode;
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  const capturedExitCode = process.exitCode;
  process.exitCode = savedExitCode;
  return { output: chunks.join(""), exitCode: capturedExitCode };
}

async function withFetch(
  mock: typeof globalThis.fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await fn();
  } finally {
    globalThis.fetch = saved;
  }
}

function successFetch(): typeof globalThis.fetch {
  return async () =>
    new Response(
      JSON.stringify({ code: "0", msg: "", data: [{ ts: "1710000000000" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

function errorFetch(code: string, msg: string): typeof globalThis.fetch {
  return async () =>
    new Response(
      JSON.stringify({ code, msg, data: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

/** Run cmdDiagnose with mocked fetch and capture output. */
async function run(config: OkxConfig, profile = "default", fetchMock?: typeof globalThis.fetch): Promise<CaptureResult> {
  return captureStdout(() =>
    withFetch(fetchMock ?? successFetch(), () => cmdDiagnose(config, profile)),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cmdDiagnose", () => {
  let savedExitCode: number | undefined;

  beforeEach(() => {
    savedExitCode = process.exitCode;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  it("prints diagnostics header", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("OKX Trade CLI Diagnostics"));
  });

  it("shows environment section with Node.js version", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("Environment"));
    assert.ok(output.includes("Node.js"));
    assert.ok(output.includes(process.version));
  });

  it("shows config section with profile name", async () => {
    const { output } = await run(BASE_CONFIG, "myprofile");
    assert.ok(output.includes("myprofile"));
  });

  it("shows credential not configured when hasAuth is false", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("not configured"));
  });

  it("shows masked API key when hasAuth is true", async () => {
    const authConfig: OkxConfig = {
      ...BASE_CONFIG,
      hasAuth: true,
      apiKey: "abcdefghij",
      secretKey: "secret",
      passphrase: "pass",
    };
    const { output } = await run(authConfig);
    assert.ok(output.includes("ab****ij"));
    assert.ok(!output.includes("abcdefghij"));
  });

  it("shows network section with DNS resolve", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("Network"));
    assert.ok(output.includes("DNS resolve"));
  });

  it("shows diagnostic report block at the end", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("Diagnostic Report"));
    assert.ok(output.includes("copy & share"));
  });

  it("report contains OS and platform info", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes(process.platform));
  });

  it("handles DNS failure for invalid hostname", async () => {
    const badConfig: OkxConfig = {
      ...BASE_CONFIG,
      baseUrl: "https://this-host-does-not-exist-okx-test.invalid",
    };
    const { output } = await run(badConfig);
    assert.ok(output.includes("FAIL") || output.includes("\u2717"));
  });

  it("handles auth error hints for code 50111", async () => {
    const authConfig: OkxConfig = {
      ...BASE_CONFIG,
      hasAuth: true,
      apiKey: "test-key-long-enough",
      secretKey: "secret",
      passphrase: "pass",
    };
    const { output } = await run(authConfig, "default", errorFetch("50111", "Invalid OK-ACCESS-KEY"));
    assert.ok(
      output.includes("invalid or expired") || output.includes("Regenerate"),
    );
  });

  it("skips auth check when no credentials", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("skipped"));
  });

  it("shows demo header info when demo=true and auth succeeds", async () => {
    const demoConfig: OkxConfig = {
      ...BASE_CONFIG,
      hasAuth: true,
      apiKey: "test-key-long-enough",
      secretKey: "secret",
      passphrase: "pass",
      demo: true,
    };
    const { output } = await run(demoConfig);
    assert.ok(output.includes("x-simulated-trading"));
  });

  it("shows base URL in config section", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("https://www.okx.com"));
  });

  it("shows timeout in config section", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("5000ms"));
  });

  it("shows demo mode in config section", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("Demo mode"));
    assert.ok(output.includes("false"));
  });

  it("shows OS release info", async () => {
    const os = await import("node:os");
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes(os.release()));
  });

  it("shows shell info or unknown", async () => {
    const { output } = await run(BASE_CONFIG);
    const shell = process.env.SHELL ?? "(unknown)";
    assert.ok(output.includes(shell));
  });

  it("shows site in config section", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("global"));
  });

  it("sets exitCode when checks fail", async () => {
    const badConfig: OkxConfig = {
      ...BASE_CONFIG,
      baseUrl: "https://this-host-does-not-exist-okx-test.invalid",
    };
    const { exitCode } = await run(badConfig);
    assert.equal(exitCode, 1);
  });

  it("report includes timestamp", async () => {
    const { output } = await run(BASE_CONFIG);
    assert.ok(output.includes("ts"));
  });
});
