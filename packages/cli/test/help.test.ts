/**
 * Tests for multi-level printHelp() — issue #38
 * Verifies that help output at each navigation level is well-formed and
 * contains the expected content so AI agents can rely on it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { printHelp } from "../src/help.js";

// ---------------------------------------------------------------------------
// Helper: capture stdout without writing to terminal
// ---------------------------------------------------------------------------
function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// Global help — printHelp()
// ---------------------------------------------------------------------------
describe("printHelp() — global overview", () => {
  it("outputs a Usage line", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("Usage: okx"), "should include Usage line");
  });

  it("lists all 9 modules with descriptions", () => {
    const out = captureStdout(() => printHelp());
    for (const mod of ["market", "account", "spot", "swap", "futures", "option", "bot", "config", "setup"]) {
      assert.ok(out.includes(mod), `should mention module '${mod}'`);
    }
  });

  it("includes a hint to run module --help", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("--help"), "should hint at running module --help");
  });

  it("includes global options section", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("--profile"), "should mention --profile option");
    assert.ok(out.includes("--demo"), "should mention --demo option");
    assert.ok(out.includes("--json"), "should mention --json option");
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("market")
// ---------------------------------------------------------------------------
describe('printHelp("market") — market module detail', () => {
  it("includes a Usage line", () => {
    const out = captureStdout(() => printHelp("market"));
    assert.ok(out.includes("Usage: okx market"), "should include module usage");
  });

  it("includes all market sub-commands with descriptions", () => {
    const out = captureStdout(() => printHelp("market"));
    for (const cmd of ["ticker", "tickers", "orderbook", "candles", "instruments",
      "funding-rate", "mark-price", "trades", "index-ticker", "index-candles",
      "price-limit", "open-interest"]) {
      assert.ok(out.includes(cmd), `should mention '${cmd}' command`);
    }
  });

  it("includes usage lines for each command", () => {
    const out = captureStdout(() => printHelp("market"));
    assert.ok(out.includes("<instId>"), "should include instId placeholder");
    assert.ok(out.includes("--instType"), "should include --instType flag");
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("account")
// ---------------------------------------------------------------------------
describe('printHelp("account") — account module detail', () => {
  it("includes all account sub-commands", () => {
    const out = captureStdout(() => printHelp("account"));
    for (const cmd of ["balance", "positions", "bills", "fees", "config", "transfer", "audit"]) {
      assert.ok(out.includes(cmd), `should mention '${cmd}' command`);
    }
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("bot") — has subgroups only
// ---------------------------------------------------------------------------
describe('printHelp("bot") — bot module overview', () => {
  it("includes Usage line mentioning strategy", () => {
    const out = captureStdout(() => printHelp("bot"));
    assert.ok(out.includes("Usage: okx bot"), "should include bot usage");
  });

  it("lists grid and dca subgroups with descriptions", () => {
    const out = captureStdout(() => printHelp("bot"));
    assert.ok(out.includes("grid"), "should mention grid strategy");
    assert.ok(out.includes("dca"), "should mention dca strategy");
    assert.ok(out.includes("Grid trading bot"), "should include grid description");
    assert.ok(out.includes("Contract DCA"), "should include dca description");
  });

  it("hints to run bot <strategy> --help", () => {
    const out = captureStdout(() => printHelp("bot"));
    assert.ok(out.includes("--help"), "should hint at running strategy --help");
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("bot", "grid")
// ---------------------------------------------------------------------------
describe('printHelp("bot", "grid") — grid bot subgroup detail', () => {
  it("includes Usage line for bot grid", () => {
    const out = captureStdout(() => printHelp("bot", "grid"));
    assert.ok(out.includes("Usage: okx bot grid"), "should include subgroup usage");
  });

  it("lists all 5 grid commands with descriptions", () => {
    const out = captureStdout(() => printHelp("bot", "grid"));
    for (const cmd of ["orders", "details", "sub-orders", "create", "stop"]) {
      assert.ok(out.includes(cmd), `should mention grid '${cmd}' command`);
    }
  });

  it("includes --algoOrdType usage flag", () => {
    const out = captureStdout(() => printHelp("bot", "grid"));
    assert.ok(out.includes("--algoOrdType"), "should include --algoOrdType flag");
  });

  it("includes grid create usage with required flags", () => {
    const out = captureStdout(() => printHelp("bot", "grid"));
    assert.ok(out.includes("--maxPx"), "should include --maxPx flag");
    assert.ok(out.includes("--minPx"), "should include --minPx flag");
    assert.ok(out.includes("--gridNum"), "should include --gridNum flag");
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("bot", "dca")
// ---------------------------------------------------------------------------
describe('printHelp("bot", "dca") — dca bot subgroup detail', () => {
  it("includes Usage line for bot dca", () => {
    const out = captureStdout(() => printHelp("bot", "dca"));
    assert.ok(out.includes("Usage: okx bot dca"), "should include subgroup usage");
  });

  it("lists all 5 dca commands", () => {
    const out = captureStdout(() => printHelp("bot", "dca"));
    for (const cmd of ["orders", "details", "sub-orders", "create", "stop"]) {
      assert.ok(out.includes(cmd), `should mention dca '${cmd}' command`);
    }
  });

  it("includes --lever in create usage", () => {
    const out = captureStdout(() => printHelp("bot", "dca"));
    assert.ok(out.includes("--lever"), "should include --lever flag");
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("spot") — has both commands and subgroups
// ---------------------------------------------------------------------------
describe('printHelp("spot") — spot module with algo subgroup', () => {
  it("includes spot direct commands", () => {
    const out = captureStdout(() => printHelp("spot"));
    for (const cmd of ["orders", "get", "fills", "place", "amend", "cancel", "batch"]) {
      assert.ok(out.includes(cmd), `should mention spot '${cmd}' command`);
    }
  });

  it("mentions algo subgroup", () => {
    const out = captureStdout(() => printHelp("spot"));
    assert.ok(out.includes("algo"), "should mention algo subgroup");
  });

  it("hints to run spot <subgroup> --help", () => {
    const out = captureStdout(() => printHelp("spot"));
    assert.ok(out.includes("--help"), "should hint at running subgroup --help");
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("spot", "algo")
// ---------------------------------------------------------------------------
describe('printHelp("spot", "algo") — spot algo subgroup detail', () => {
  it("includes Usage line for spot algo", () => {
    const out = captureStdout(() => printHelp("spot", "algo"));
    assert.ok(out.includes("Usage: okx spot algo"), "should include subgroup usage");
  });

  it("lists algo commands: orders, place, amend, cancel", () => {
    const out = captureStdout(() => printHelp("spot", "algo"));
    for (const cmd of ["orders", "place", "amend", "cancel"]) {
      assert.ok(out.includes(cmd), `should mention spot algo '${cmd}' command`);
    }
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("swap", "algo")
// ---------------------------------------------------------------------------
describe('printHelp("swap", "algo") — swap algo subgroup detail', () => {
  it("includes Usage line for swap algo", () => {
    const out = captureStdout(() => printHelp("swap", "algo"));
    assert.ok(out.includes("Usage: okx swap algo"), "should include subgroup usage");
  });

  it("lists swap algo commands including trail", () => {
    const out = captureStdout(() => printHelp("swap", "algo"));
    for (const cmd of ["orders", "trail", "place", "amend", "cancel"]) {
      assert.ok(out.includes(cmd), `should mention swap algo '${cmd}' command`);
    }
  });
});

// ---------------------------------------------------------------------------
// Error handling — unknown module / subgroup
// ---------------------------------------------------------------------------
describe("printHelp() — error handling", () => {
  it("writes error to stderr for unknown module", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => printHelp("nonexistent-module"));
    assert.ok(err.includes("Unknown module"), "should report unknown module");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  it("writes error to stderr for unknown subgroup", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => printHelp("bot", "nonexistent-subgroup"));
    assert.ok(err.includes("Unknown subgroup"), "should report unknown subgroup");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });
});


// ---------------------------------------------------------------------------
// Module-level help — printHelp("setup") — no sub-commands, usage only
// ---------------------------------------------------------------------------
describe('printHelp("setup") — setup module with usage only', () => {
  it("includes Usage line with --client flag", () => {
    const out = captureStdout(() => printHelp("setup"));
    assert.ok(out.includes("Usage: okx setup"), "should include setup usage");
    assert.ok(out.includes("--client"), "should include --client flag");
  });

  it("does NOT mention configure as a sub-command", () => {
    const out = captureStdout(() => printHelp("setup"));
    assert.ok(!out.includes("configure"), "should NOT mention non-existent configure sub-command");
  });
});

// ---------------------------------------------------------------------------
// Verify backward-compat: existing tests still pass
// ---------------------------------------------------------------------------
describe("printHelp() — backward compatibility", () => {
  it("printHelp() with no args outputs all major module names", () => {
    const out = captureStdout(() => printHelp());
    for (const mod of ["market", "account", "spot", "swap", "futures", "bot", "config", "setup"]) {
      assert.ok(out.includes(mod), `should include '${mod}'`);
    }
  });
});
