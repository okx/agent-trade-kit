/**
 * Unit tests for the okx-auth binary execution helpers.
 *
 * Uses a mock binary script (fixtures/mock-auth-binary.mjs) controlled
 * by environment variables to simulate different exit codes and outputs.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  getAuthBinaryPath,
  execAuthToken,
  execAuthStatus,
} from "../src/auth/binary.js";
import { execAuthTokenWindows } from "../src/auth/binary-windows.js";
import { AuthenticationError, ConfigError, NotLoggedInError } from "../src/utils/errors.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MOCK_BINARY = join(__dirname, "fixtures", "mock-auth-binary.mjs");

// ---------------------------------------------------------------------------
// Env save / restore helpers
// ---------------------------------------------------------------------------

let savedAuthBin: string | undefined;
let savedMockExit: string | undefined;
let savedMockToken: string | undefined;
let savedMockStatus: string | undefined;

function saveMockEnv(): void {
  savedAuthBin = process.env.OKX_AUTH_BIN;
  savedMockExit = process.env.MOCK_AUTH_EXIT;
  savedMockToken = process.env.MOCK_AUTH_TOKEN;
  savedMockStatus = process.env.MOCK_AUTH_STATUS_JSON;
}

function restoreMockEnv(): void {
  const restore = (key: string, saved: string | undefined) => {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  };
  restore("OKX_AUTH_BIN", savedAuthBin);
  restore("MOCK_AUTH_EXIT", savedMockExit);
  restore("MOCK_AUTH_TOKEN", savedMockToken);
  restore("MOCK_AUTH_STATUS_JSON", savedMockStatus);
}

function setMockBinary(exitCode?: number, token?: string, statusJson?: string): void {
  // Use node to run the .mjs mock — ensures it works cross-platform
  process.env.OKX_AUTH_BIN = MOCK_BINARY;
  if (exitCode !== undefined) process.env.MOCK_AUTH_EXIT = String(exitCode);
  else delete process.env.MOCK_AUTH_EXIT;
  if (token !== undefined) process.env.MOCK_AUTH_TOKEN = token;
  else delete process.env.MOCK_AUTH_TOKEN;
  if (statusJson !== undefined) process.env.MOCK_AUTH_STATUS_JSON = statusJson;
  else delete process.env.MOCK_AUTH_STATUS_JSON;
}

// ---------------------------------------------------------------------------
// getAuthBinaryPath
// ---------------------------------------------------------------------------

describe("getAuthBinaryPath", () => {
  beforeEach(() => saveMockEnv());
  afterEach(() => restoreMockEnv());

  it("returns OKX_AUTH_BIN env var when set", () => {
    process.env.OKX_AUTH_BIN = "/custom/path/okx-auth";
    assert.equal(getAuthBinaryPath(), "/custom/path/okx-auth");
  });

  it("returns default path under ~/.okx/bin when env var is not set", () => {
    delete process.env.OKX_AUTH_BIN;
    const result = getAuthBinaryPath();
    assert.ok(result.includes(".okx"), `expected path to include .okx, got: ${result}`);
    assert.ok(result.includes("bin"), `expected path to include bin, got: ${result}`);
    assert.ok(result.includes("okx-auth"), `expected path to include okx-auth, got: ${result}`);
  });
});

// ---------------------------------------------------------------------------
// execAuthToken
// ---------------------------------------------------------------------------

describe("execAuthToken", () => {
  beforeEach(() => saveMockEnv());
  afterEach(() => restoreMockEnv());

  it("resolves with token on successful exit (code 0)", async () => {
    setMockBinary(0, "test-access-token-12345");
    const token = await execAuthToken();
    assert.equal(token, "test-access-token-12345");
  });

  it("rejects with AuthenticationError when token is empty (exit 0)", async () => {
    setMockBinary(0, "");
    await assert.rejects(
      () => execAuthToken(),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("empty token"));
        return true;
      },
    );
  });

  it("rejects with NotLoggedInError for NOT_LOGGED_IN (exit 2)", async () => {
    setMockBinary(2);
    await assert.rejects(
      () => execAuthToken(),
      (err: Error) => {
        assert.ok(err instanceof NotLoggedInError);
        assert.ok(err instanceof ConfigError); // subclass of ConfigError
        assert.ok(err.message.includes("Not logged in"));
        return true;
      },
    );
  });

  it("rejects with AuthenticationError for UNAUTHORIZED_CALLER (exit 1)", async () => {
    setMockBinary(1);
    await assert.rejects(
      () => execAuthToken(),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("unauthorized") || err.message.includes("rejected"));
        return true;
      },
    );
  });

  it("rejects with AuthenticationError for REFRESH_FAILED (exit 3)", async () => {
    setMockBinary(3);
    await assert.rejects(
      () => execAuthToken(),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("refresh failed") || err.message.includes("Token refresh"));
        return true;
      },
    );
  });

  it("rejects with AuthenticationError for unknown exit code", async () => {
    setMockBinary(99);
    await assert.rejects(
      () => execAuthToken(),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("99"));
        return true;
      },
    );
  });

  it("rejects with ConfigError when binary does not exist", async () => {
    process.env.OKX_AUTH_BIN = "/nonexistent/path/okx-auth";
    delete process.env.MOCK_AUTH_EXIT;
    await assert.rejects(
      () => execAuthToken(),
      (err: Error) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes("Failed to spawn"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// execAuthStatus
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// execAuthTokenWindows (named-pipe / UNIX-socket transport)
//
// We cover the Windows code path on every host: real Windows uses a named
// pipe, POSIX hosts substitute a UNIX domain socket. Node's net.createServer
// / createConnection handle both transparently, so the only thing we vary is
// the path the consumer hands the child via OKX_AUTH_TOKEN_PIPE.
// ---------------------------------------------------------------------------

describe("execAuthTokenWindows (pipe transport)", () => {
  let tmpDir: string;

  beforeEach(() => {
    saveMockEnv();
    tmpDir = mkdtempSync(join(tmpdir(), "okx-auth-pipe-"));
  });
  afterEach(() => {
    restoreMockEnv();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Build a fresh socket path the mock binary can connect to. */
  function makePipePathFactory(): () => string {
    let counter = 0;
    return () => join(tmpDir, `sock-${++counter}`);
  }

  it("resolves with token written to the pipe", async () => {
    setMockBinary(0, "windows-token-abc");
    const token = await execAuthTokenWindows(
      MOCK_BINARY,
      makePipePathFactory(),
    );
    assert.equal(token, "windows-token-abc");
  });

  it("rejects with AuthenticationError when token is empty (exit 0)", async () => {
    setMockBinary(0, "");
    await assert.rejects(
      () => execAuthTokenWindows(MOCK_BINARY, makePipePathFactory()),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("empty token"));
        return true;
      },
    );
  });

  it("rejects with NotLoggedInError for NOT_LOGGED_IN (exit 2)", async () => {
    setMockBinary(2);
    await assert.rejects(
      () => execAuthTokenWindows(MOCK_BINARY, makePipePathFactory()),
      (err: Error) => {
        assert.ok(err instanceof NotLoggedInError);
        return true;
      },
    );
  });

  it("rejects with AuthenticationError for UNAUTHORIZED_CALLER (exit 1)", async () => {
    setMockBinary(1);
    await assert.rejects(
      () => execAuthTokenWindows(MOCK_BINARY, makePipePathFactory()),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("unauthorized") || err.message.includes("rejected"));
        return true;
      },
    );
  });

  it("rejects with AuthenticationError for REFRESH_FAILED (exit 3)", async () => {
    setMockBinary(3);
    await assert.rejects(
      () => execAuthTokenWindows(MOCK_BINARY, makePipePathFactory()),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("refresh failed") || err.message.includes("Token refresh"));
        return true;
      },
    );
  });

  it("rejects with AuthenticationError for unknown exit code", async () => {
    setMockBinary(99);
    await assert.rejects(
      () => execAuthTokenWindows(MOCK_BINARY, makePipePathFactory()),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.ok(err.message.includes("99"));
        return true;
      },
    );
  });

  it("rejects with ConfigError when binary does not exist", async () => {
    delete process.env.MOCK_AUTH_EXIT;
    await assert.rejects(
      () =>
        execAuthTokenWindows(
          "/nonexistent/path/okx-auth",
          makePipePathFactory(),
        ),
      (err: Error) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes("Failed to spawn"));
        return true;
      },
    );
  });
});

describe("execAuthStatus", () => {
  beforeEach(() => saveMockEnv());
  afterEach(() => restoreMockEnv());

  it("returns parsed AuthStatusResult on success", async () => {
    const statusJson = JSON.stringify({
      profile: "default",
      site: "global",
      status: "logged_in",
      expiresAt: "2026-04-15T00:00:00Z",
    });
    setMockBinary(0, undefined, statusJson);
    const result = await execAuthStatus();
    assert.ok(result !== null);
    assert.equal(result!.status, "logged_in");
    assert.equal(result!.profile, "default");
  });

  it("returns null on non-zero exit code", async () => {
    setMockBinary(1, undefined, "{}");
    const result = await execAuthStatus();
    assert.equal(result, null);
  });

  it("returns null on malformed JSON output", async () => {
    setMockBinary(0, undefined, "not-valid-json{{{");
    const result = await execAuthStatus();
    assert.equal(result, null);
  });

  it("returns null when binary does not exist", async () => {
    process.env.OKX_AUTH_BIN = "/nonexistent/path/okx-auth";
    delete process.env.MOCK_AUTH_EXIT;
    delete process.env.MOCK_AUTH_STATUS_JSON;
    const result = await execAuthStatus();
    assert.equal(result, null);
  });
});

