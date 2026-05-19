/**
 * Unit tests for CLI auth commands.
 *
 * Tests the router, install/install-status/remove commands via filesystem,
 * and login/logout/status commands via the mock-auth-binary fixture.
 *
 * Output capture uses the formatter's setOutput/resetOutput instead of
 * patching process.stdout.write (which would swallow the test runner's output).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  handleAuthCommand,
  cmdAuthInstallStatus,
  cmdAuthInstall,
  cmdAuthRemove,
  cmdAuthLogin,
  cmdAuthLogout,
  cmdAuthStatus,
} from "../src/commands/auth.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MOCK_BINARY = join(__dirname, "..", "..", "core", "test", "fixtures", "mock-auth-binary.mjs");

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cli-auth-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// Env save/restore
const ENV_KEYS = [
  "OKX_AUTH_BIN",
  "MOCK_AUTH_EXIT",
  "MOCK_AUTH_TOKEN",
  "MOCK_AUTH_STATUS_JSON",
  "MOCK_AUTH_ARGS_FILE",
  "HOME",
] as const;

type SavedEnv = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function saveEnv(): SavedEnv {
  const saved: SavedEnv = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: SavedEnv): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

/** Capture formatter output (stdout + stderr) using setOutput/resetOutput. */
function createCapture(): { out: string[]; err: string[]; install: () => void; restore: () => void; stdout: () => string; stderr: () => string } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    install: () => setOutput({ out: (msg) => out.push(msg), err: (msg) => err.push(msg) }),
    restore: () => resetOutput(),
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
}

/** Capture stdout from process.stdout.write (for child process output). */
async function captureProcessStdout(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// handleAuthCommand — router
// ---------------------------------------------------------------------------

describe("handleAuthCommand - router", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("sets exitCode=1 for unknown action", () => {
    const cap = createCapture();
    cap.install();
    try {
      handleAuthCommand("unknown-action", [], {});
    } finally {
      cap.restore();
    }
    assert.equal(process.exitCode, 1);
    assert.ok(cap.stderr().includes("Unknown auth command"));
  });
});

// ---------------------------------------------------------------------------
// cmdAuthInstallStatus
// ---------------------------------------------------------------------------

describe("cmdAuthInstallStatus", () => {
  let saved: SavedEnv;

  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("outputs JSON with exists=false when binary is not installed", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthInstallStatus(true);
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.equal(data.exists, false);
  });

  it("outputs JSON with exists=true when binary exists", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthInstallStatus(true);
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.equal(data.exists, true);
    assert.ok(typeof data.sha256 === "string");
    assert.ok(typeof data.fileSize === "number");
  });

  it("outputs text with 'no' when binary is not installed", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthInstallStatus(false);
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("no"), "should indicate not installed");
  });

  it("outputs text with 'yes' when binary exists", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthInstallStatus(false);
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("yes"), "should indicate installed");
    assert.ok(cap.stdout().includes("SHA-256"), "should show SHA-256");
  });
});

// ---------------------------------------------------------------------------
// cmdAuthInstall
// ---------------------------------------------------------------------------

describe("cmdAuthInstall", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("outputs JSON with status when called with json=true", async () => {
    // OKX_AUTH_BIN env override → installAuthBinary returns up-to-date
    process.env.OKX_AUTH_BIN = join(tempDir, "okx-auth");
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthInstall(true);
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.ok(["installed", "up-to-date", "failed"].includes(data.status));
    assert.ok(Array.isArray(data.messages));
  });

  it("outputs text when called with json=false", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "okx-auth");
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthInstall(false);
    } finally {
      cap.restore();
    }
    const output = cap.stdout();
    assert.ok(output.includes("Installing") || output.includes("up to date") || output.includes("failed"));
  });
});

// ---------------------------------------------------------------------------
// cmdAuthRemove
// ---------------------------------------------------------------------------

describe("cmdAuthRemove", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("outputs JSON not-installed when binary does not exist", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(true, true);
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.equal(data.status, "not-installed");
  });

  it("outputs text not-installed when binary does not exist", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(true, false);
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("not installed"));
  });

  it("removes binary with force=true and outputs JSON", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(true, true);
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.equal(data.status, "removed");
  });

  it("removes binary with force=true and outputs text", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(true, false);
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("Removed"));
  });

  it("rejects non-TTY stdin without force flag", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;

    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as any;
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(false, false);
    } finally {
      cap.restore();
      process.stdin.isTTY = origIsTTY;
    }
    assert.equal(process.exitCode, 1);
    assert.ok(cap.stderr().includes("TTY") || cap.stderr().includes("--force"));
  });

  it("catches removeAuthBinary throw and calls errorLine in text mode", async () => {
    // Root can always delete files regardless of directory permissions — skip.
    if (process.getuid?.() === 0) return;

    const subDir = join(tempDir, "auth-bin");
    mkdirSync(subDir);
    const binPath = join(subDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;

    // Remove write permission from parent dir so unlinkSync throws EACCES.
    chmodSync(subDir, 0o555);
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(true, false);
    } finally {
      cap.restore();
      chmodSync(subDir, 0o755);
    }

    assert.equal(process.exitCode, 1);
    assert.ok(
      cap.stderr().length > 0,
      `expected error message in stderr, got empty string`,
    );
  });

  it("catches removeAuthBinary throw and outputs JSON with status=failed in json mode", async () => {
    // Root can always delete files regardless of directory permissions — skip.
    if (process.getuid?.() === 0) return;

    const subDir = join(tempDir, "auth-bin-json");
    mkdirSync(subDir);
    const binPath = join(subDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;

    // Remove write permission from parent dir so unlinkSync throws EACCES.
    chmodSync(subDir, 0o555);
    const cap = createCapture();
    cap.install();
    try {
      await cmdAuthRemove(true, true);
    } finally {
      cap.restore();
      chmodSync(subDir, 0o755);
    }

    assert.equal(process.exitCode, 1);
    const data = JSON.parse(cap.stdout().trim());
    assert.equal(data.status, "failed");
    assert.ok(typeof data.error === "string" && data.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// cmdAuthLogin / cmdAuthLogout / cmdAuthStatus — via mock binary
// ---------------------------------------------------------------------------

describe("cmdAuthLogin", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    // Point HOME at the empty tempDir so findApiKeyProfile() sees no config
    // and the api_key guard does not short-circuit these tests.
    process.env.HOME = tempDir;
  });
  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("completes without error on exit code 0", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "0";
    await cmdAuthLogin({});
    assert.equal(process.exitCode, undefined);
  });

  it("sets exitCode on non-zero exit", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "2";
    await cmdAuthLogin({});
    assert.equal(process.exitCode, 2);
  });

  it("passes --site and --manual flags without error", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "0";
    await cmdAuthLogin({ site: "global", manual: true });
    assert.equal(process.exitCode, undefined);
  });

  describe("api_key guard", () => {
    /** Write a minimal config.toml with one profile, optionally with api_key. */
    function writeConfig(withApiKey: boolean, profileName = "prod"): void {
      const cfgDir = join(tempDir, ".okx");
      mkdirSync(cfgDir, { recursive: true });
      const lines = [
        `default_profile = "${profileName}"`,
        ``,
        `[profiles.${profileName}]`,
        withApiKey ? `api_key = "AKXX"` : ``,
        `site = "global"`,
      ];
      writeFileSync(join(cfgDir, "config.toml"), lines.filter(Boolean).join("\n"), "utf-8");
    }

    it("skips OAuth and prints text message when any profile has api_key", async () => {
      writeConfig(true, "prod");
      // Point to a nonexistent binary: guard must fire before spawn.
      process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
      const cap = createCapture();
      cap.install();
      try {
        await cmdAuthLogin({});
      } finally {
        cap.restore();
      }
      assert.equal(process.exitCode, undefined, "guard should exit cleanly");
      assert.ok(cap.stdout().includes("API key already configured"));
      assert.ok(cap.stdout().includes("prod"));
    });

    it("emits structured JSON when --manual and api_key profile exists", async () => {
      writeConfig(true, "myprof");
      process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
      const cap = createCapture();
      cap.install();
      try {
        await cmdAuthLogin({ manual: true });
      } finally {
        cap.restore();
      }
      assert.equal(process.exitCode, undefined);
      const data = JSON.parse(cap.stdout().trim());
      assert.equal(data.status, "skipped");
      assert.equal(data.reason, "api_key_configured");
      assert.equal(data.profile, "myprof");
    });

    it("proceeds to OAuth when config has profile without api_key", async () => {
      writeConfig(false);
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "0";
      await cmdAuthLogin({});
      assert.equal(process.exitCode, undefined);
    });

    it("proceeds to OAuth when no config file exists", async () => {
      // No config written, tempDir is clean.
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "0";
      await cmdAuthLogin({});
      assert.equal(process.exitCode, undefined);
    });
  });
});

describe("cmdAuthLogout", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("completes without error on exit code 0", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "0";
    await cmdAuthLogout();
    assert.equal(process.exitCode, undefined);
  });

  it("sets exitCode on non-zero exit", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "1";
    await cmdAuthLogout();
    assert.equal(process.exitCode, 1);
  });
});

describe("cmdAuthStatus", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("captures and passes through stdout", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "0";
    process.env.MOCK_AUTH_STATUS_JSON = JSON.stringify({ status: "logged_in" });
    // cmdAuthStatus uses runOkxAuthCapture which spawns a child process
    // The child's stdout is piped and then written via process.stdout.write
    const output = await captureProcessStdout(() => cmdAuthStatus({}));
    assert.ok(output.includes("logged_in"));
  });

  it("sets exitCode on non-zero exit", async () => {
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "1";
    process.env.MOCK_AUTH_STATUS_JSON = "";
    await captureProcessStdout(() => cmdAuthStatus({}));
    assert.equal(process.exitCode, 1);
  });
});

// ---------------------------------------------------------------------------
// handleAuthCommand — parameter routing
//
// Verifies that the router reads key params from v.xxx (named flags),
// NOT from rest[N] (positional args). See issue #78 for prior incident.
// ---------------------------------------------------------------------------

describe("handleAuthCommand - parameter routing", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;
  let argsFile: string;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    argsFile = join(tempDir, "captured-args.json");
    process.env.OKX_AUTH_BIN = MOCK_BINARY;
    process.env.MOCK_AUTH_EXIT = "0";
    process.env.MOCK_AUTH_ARGS_FILE = argsFile;
    // Point HOME at empty tempDir so the api_key guard does not short-circuit
    // login routing tests.
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  /** Read the args captured by mock binary. */
  function readCapturedArgs(): string[] {
    return JSON.parse(readFileSync(argsFile, "utf-8"));
  }

  // -- login ----------------------------------------------------------------

  it("login: site and manual come from v (named flags)", async () => {
    await handleAuthCommand("login", [], { site: "global", manual: true });
    const args = readCapturedArgs();
    assert.deepEqual(args, ["login", "--site", "global", "--manual"]);
  });

  it("login: rest args are not leaked to the binary", async () => {
    await handleAuthCommand("login", ["SHOULD-NOT-USE"], { site: "hk" });
    const args = readCapturedArgs();
    assert.ok(!args.includes("SHOULD-NOT-USE"), "rest[0] must not leak");
    assert.ok(args.includes("--site"), "--site flag must be present");
    assert.ok(args.includes("hk"), "site value must be present");
  });

  it("login: omitted optional flags are not passed", async () => {
    await handleAuthCommand("login", [], {});
    const args = readCapturedArgs();
    assert.deepEqual(args, ["login"]);
  });

  // -- logout ---------------------------------------------------------------

  it("logout: routes correctly with no params", async () => {
    await handleAuthCommand("logout", [], {});
    const args = readCapturedArgs();
    assert.deepEqual(args, ["logout"]);
  });

  // -- status ---------------------------------------------------------------

  it("status: json flag comes from v.json", async () => {
    process.env.MOCK_AUTH_STATUS_JSON = JSON.stringify({ status: "ok" });
    await (handleAuthCommand("status", [], { json: true }) as Promise<void>);
    const args = readCapturedArgs();
    assert.deepEqual(args, ["status", "--json"]);
  });

  it("status: json omitted when v.json is falsy", async () => {
    process.env.MOCK_AUTH_STATUS_JSON = "text-output";
    await (handleAuthCommand("status", [], {}) as Promise<void>);
    const args = readCapturedArgs();
    assert.deepEqual(args, ["status"]);
  });

  // -- install (no binary spawn — verify via output format) -----------------

  it("install: json=true produces JSON output", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "okx-auth");
    delete process.env.MOCK_AUTH_ARGS_FILE;
    const cap = createCapture();
    cap.install();
    try {
      await handleAuthCommand("install", [], { json: true });
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.ok("status" in data, "json output must have status field");
  });

  // -- install-status (no binary spawn — verify via output format) ----------

  it("install-status: json=true produces JSON output", async () => {
    process.env.OKX_AUTH_BIN = join(tempDir, "nonexistent-okx-auth");
    delete process.env.MOCK_AUTH_ARGS_FILE;
    const cap = createCapture();
    cap.install();
    try {
      await handleAuthCommand("install-status", [], { json: true });
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.ok("exists" in data, "json output must have exists field");
  });

  // -- remove (no binary spawn — verify force + json routing) ---------------

  it("remove: force and json come from v", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;
    delete process.env.MOCK_AUTH_ARGS_FILE;
    const cap = createCapture();
    cap.install();
    try {
      await handleAuthCommand("remove", [], { force: true, json: true });
    } finally {
      cap.restore();
    }
    const data = JSON.parse(cap.stdout().trim());
    assert.equal(data.status, "removed");
  });

  it("remove: without force on non-TTY sets exitCode=1", async () => {
    const binPath = join(tempDir, "okx-auth");
    writeFileSync(binPath, Buffer.from("fake-binary"));
    process.env.OKX_AUTH_BIN = binPath;
    delete process.env.MOCK_AUTH_ARGS_FILE;
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = undefined as any;
    const cap = createCapture();
    cap.install();
    try {
      await handleAuthCommand("remove", [], { json: false });
    } finally {
      cap.restore();
      process.stdin.isTTY = origIsTTY;
    }
    assert.equal(process.exitCode, 1, "must fail without force on non-TTY");
  });
});
