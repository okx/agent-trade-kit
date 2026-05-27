/**
 * Unit tests for the `okx prediction` CLI wrapper.
 *
 * The wrapper spawns the external okx-predict binary. Tests cover:
 *   1. Argument forwarding (using a mock binary that records argv to a file)
 *   2. Help output (no spawn — exits early)
 *   3. Binary-not-found UX (PATH-empty + OKX_PREDICT_BIN unset → exit 127)
 *   4. Global --json flag is appended when not already present
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { handlePredictionCommand } from "../src/commands/prediction.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MOCK_BINARY = join(
  __dirname,
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "mock-okx-predict-binary.mjs",
);

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cli-prediction-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const ENV_KEYS = [
  "OKX_PREDICT_BIN",
  "MOCK_PREDICT_EXIT",
  "MOCK_PREDICT_STDOUT",
  "MOCK_PREDICT_STDERR",
  "MOCK_PREDICT_ARGS_FILE",
  "PATH",
] as const;

type SavedEnv = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function saveEnv(): SavedEnv {
  const saved: SavedEnv = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: SavedEnv): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function createCapture(): {
  install: () => void;
  restore: () => void;
  stdout: () => string;
  stderr: () => string;
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    install: () =>
      setOutput({
        out: (msg) => out.push(msg),
        err: (msg) => err.push(msg),
      }),
    restore: () => resetOutput(),
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
}

// ---------------------------------------------------------------------------
// help output (no spawn)
// ---------------------------------------------------------------------------

describe("handlePredictionCommand - help output", () => {
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

  it("prints help when action is undefined", async () => {
    const cap = createCapture();
    cap.install();
    try {
      await handlePredictionCommand(undefined, [], {});
    } finally {
      cap.restore();
    }
    const text = cap.stdout();
    assert.ok(text.includes("Usage: okx prediction"), "help header missing");
    assert.ok(text.includes("events"), "events listed");
    assert.ok(text.includes("clob"), "clob listed");
    assert.ok(text.includes("ctf"), "ctf listed");
    assert.ok(text.includes("status"), "status listed");
    assert.ok(text.includes("@okx/predict-market-cli"), "install reference");
    assert.ok(!text.includes(" ws "), "ws should NOT be listed (WS support dropped)");
  });

  it("prints help when action is --help", async () => {
    const cap = createCapture();
    cap.install();
    try {
      await handlePredictionCommand("--help", [], {});
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("Usage: okx prediction"));
  });

  it("prints help when action is -h", async () => {
    const cap = createCapture();
    cap.install();
    try {
      await handlePredictionCommand("-h", [], {});
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("Usage: okx prediction"));
  });

  it("prints help when action is 'help'", async () => {
    const cap = createCapture();
    cap.install();
    try {
      await handlePredictionCommand("help", [], {});
    } finally {
      cap.restore();
    }
    assert.ok(cap.stdout().includes("Usage: okx prediction"));
  });
});

// ---------------------------------------------------------------------------
// binary-not-found UX
// ---------------------------------------------------------------------------

describe("handlePredictionCommand - binary not found", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    process.env.PATH = tempDir; // empty PATH (only an empty temp dir)
    delete process.env.OKX_PREDICT_BIN;
  });

  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("prints install hint and sets exit 127 when binary missing", async () => {
    const cap = createCapture();
    cap.install();
    try {
      await handlePredictionCommand("events", [], {});
    } finally {
      cap.restore();
    }
    assert.equal(process.exitCode, 127);
    const err = cap.stderr();
    assert.ok(err.includes("okx-predict binary not found"));
    assert.ok(err.includes("@okx/predict-market-cli"));
    assert.ok(err.includes("OKX_PREDICT_BIN"));
  });

  it("treats invalid OKX_PREDICT_BIN path as not-found", async () => {
    process.env.OKX_PREDICT_BIN = join(tempDir, "nonexistent");
    const cap = createCapture();
    cap.install();
    try {
      await handlePredictionCommand("events", [], {});
    } finally {
      cap.restore();
    }
    assert.equal(process.exitCode, 127);
    assert.ok(cap.stderr().includes("okx-predict binary not found"));
  });
});

// ---------------------------------------------------------------------------
// argument forwarding (mock binary)
// ---------------------------------------------------------------------------

describe("handlePredictionCommand - argument forwarding", () => {
  let saved: SavedEnv;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    saved = saveEnv();
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    // Point OKX_PREDICT_BIN at the mock script (executable .mjs)
    process.env.OKX_PREDICT_BIN = MOCK_BINARY;
    assert.ok(
      existsSync(MOCK_BINARY),
      `mock binary fixture missing at ${MOCK_BINARY}`,
    );
  });

  afterEach(() => {
    restoreEnv(saved);
    process.exitCode = savedExitCode;
  });

  it("forwards action and rest args verbatim", async () => {
    const argsFile = join(tempDir, "argv.json");
    process.env.MOCK_PREDICT_ARGS_FILE = argsFile;
    await handlePredictionCommand(
      "events",
      ["--status", "active", "--limit", "10"],
      {},
    );
    const recorded = JSON.parse(readFileSync(argsFile, "utf-8"));
    assert.deepEqual(recorded, ["events", "--status", "active", "--limit", "10"]);
  });

  it("appends --json when global json flag is on and not already present", async () => {
    const argsFile = join(tempDir, "argv.json");
    process.env.MOCK_PREDICT_ARGS_FILE = argsFile;
    await handlePredictionCommand("account", ["balance"], { json: true });
    const recorded = JSON.parse(readFileSync(argsFile, "utf-8"));
    assert.deepEqual(recorded, ["account", "balance", "--json"]);
  });

  it("does not duplicate --json if user already passed it", async () => {
    const argsFile = join(tempDir, "argv.json");
    process.env.MOCK_PREDICT_ARGS_FILE = argsFile;
    await handlePredictionCommand("account", ["balance", "--json"], { json: true });
    const recorded = JSON.parse(readFileSync(argsFile, "utf-8"));
    assert.deepEqual(recorded, ["account", "balance", "--json"]);
  });

  it("does not duplicate when user passed short -j", async () => {
    const argsFile = join(tempDir, "argv.json");
    process.env.MOCK_PREDICT_ARGS_FILE = argsFile;
    await handlePredictionCommand("clob", ["price", "--asset", "100888000", "-j"], { json: true });
    const recorded = JSON.parse(readFileSync(argsFile, "utf-8"));
    assert.deepEqual(recorded, ["clob", "price", "--asset", "100888000", "-j"]);
  });

  it("propagates non-zero exit code from binary", async () => {
    process.env.MOCK_PREDICT_EXIT = "2";
    await handlePredictionCommand("status", [], {});
    assert.equal(process.exitCode, 2);
  });

  it("does not set exit code when binary exits 0", async () => {
    process.env.MOCK_PREDICT_EXIT = "0";
    await handlePredictionCommand("status", [], {});
    assert.equal(process.exitCode, undefined);
  });
});

// ---------------------------------------------------------------------------
// main() short-circuit — wrapper-only flags must NOT be rejected by the
// strict parseCli validator before routing reaches handlePredictionCommand.
//
// Regression: before the peekFirstPositional short-circuit, `okx prediction
// clob price --asset 101209000` aborted with `Unknown option '--asset'`
// because --asset is intentionally not in CLI_OPTIONS (it belongs to the
// external okx-predict binary).
// ---------------------------------------------------------------------------
describe("CLI main() — prediction passthrough", () => {
  const dist = join(__dirname, "..", "dist", "index.js");

  it("forwards wrapper-only flags (e.g. --asset) to okx-predict without main-CLI rejection", () => {
    if (!existsSync(dist)) {
      // dist is produced by `pnpm build`; skip when running in an unbuilt env.
      return;
    }
    const tmp = mkdtempSync(join(tmpdir(), "okx-predict-passthrough-"));
    const argsFile = join(tmp, "argv.json");
    try {
      execFileSync(
        "node",
        [dist, "prediction", "clob", "price", "--asset", "101209000", "--json"],
        {
          timeout: 10_000,
          encoding: "utf-8",
          env: {
            ...process.env,
            OKX_PREDICT_BIN: MOCK_BINARY,
            MOCK_PREDICT_ARGS_FILE: argsFile,
            MOCK_PREDICT_EXIT: "0",
          },
        },
      );
      const recorded = JSON.parse(readFileSync(argsFile, "utf-8"));
      assert.deepEqual(
        recorded,
        ["clob", "price", "--asset", "101209000", "--json"],
        "wrapper-only flags must be forwarded verbatim",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("still appends --json when only the global flag is set before the module", () => {
    if (!existsSync(dist)) return;
    const tmp = mkdtempSync(join(tmpdir(), "okx-predict-passthrough-json-"));
    const argsFile = join(tmp, "argv.json");
    try {
      execFileSync(
        "node",
        [dist, "--json", "prediction", "account", "balance"],
        {
          timeout: 10_000,
          encoding: "utf-8",
          env: {
            ...process.env,
            OKX_PREDICT_BIN: MOCK_BINARY,
            MOCK_PREDICT_ARGS_FILE: argsFile,
            MOCK_PREDICT_EXIT: "0",
          },
        },
      );
      const recorded = JSON.parse(readFileSync(argsFile, "utf-8"));
      assert.deepEqual(recorded, ["account", "balance", "--json"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
