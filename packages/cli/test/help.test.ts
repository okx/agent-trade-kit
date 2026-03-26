/**
 * Tests for multi-level printHelp() — issue #38
 * Verifies that help output at each navigation level is well-formed and
 * contains the expected content so AI agents can rely on it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { printHelp } from "../src/help.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Helper: capture output without writing to terminal
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
// Global help — printHelp()
// ---------------------------------------------------------------------------
describe("printHelp() — global overview", () => {
  it("outputs a Usage line", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("Usage: okx"), "should include Usage line");
  });

  it("lists all major modules with descriptions", () => {
    const out = captureStdout(() => printHelp());
    for (const mod of ["market", "account", "spot", "swap", "futures", "option", "bot", "earn", "config", "setup"]) {
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
    assert.ok(out.includes("DCA (Martingale)"), "should include dca description");
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
// Module-level help — printHelp("futures")
// ---------------------------------------------------------------------------
describe('printHelp("futures") — futures module detail', () => {
  it("includes all futures direct commands", () => {
    const out = captureStdout(() => printHelp("futures"));
    for (const cmd of ["orders", "positions", "fills", "place", "cancel", "amend", "get", "close", "get-leverage", "leverage", "batch"]) {
      assert.ok(out.includes(cmd), `should mention futures '${cmd}' command`);
    }
  });

  it("mentions algo subgroup", () => {
    const out = captureStdout(() => printHelp("futures"));
    assert.ok(out.includes("algo"), "should mention algo subgroup");
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("futures", "algo")
// ---------------------------------------------------------------------------
describe('printHelp("futures", "algo") — futures algo subgroup detail', () => {
  it("includes Usage line for futures algo", () => {
    const out = captureStdout(() => printHelp("futures", "algo"));
    assert.ok(out.includes("Usage: okx futures algo"), "should include subgroup usage");
  });

  it("lists all futures algo commands including trail, place, amend, cancel, orders", () => {
    const out = captureStdout(() => printHelp("futures", "algo"));
    for (const cmd of ["trail", "place", "amend", "cancel", "orders"]) {
      assert.ok(out.includes(cmd), `should mention futures algo '${cmd}' command`);
    }
  });

  it("includes key flags for trail command", () => {
    const out = captureStdout(() => printHelp("futures", "algo"));
    assert.ok(out.includes("--callbackRatio"), "should include --callbackRatio flag");
    assert.ok(out.includes("--activePx"), "should include --activePx flag");
    assert.ok(out.includes("--posSide"), "should include --posSide flag");
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
// Module-level help — printHelp("earn") — earn module with DCD subgroup
// ---------------------------------------------------------------------------
describe('printHelp("earn") — earn module overview', () => {
  it("includes Usage line", () => {
    const out = captureStdout(() => printHelp("earn"));
    assert.ok(out.includes("Usage: okx earn"), "should include earn usage");
  });

  it("lists savings, onchain, and dcd subgroups", () => {
    const out = captureStdout(() => printHelp("earn"));
    assert.ok(out.includes("savings"), "should mention savings subgroup");
    assert.ok(out.includes("onchain"), "should mention onchain subgroup");
    assert.ok(out.includes("dcd"), "should mention dcd subgroup");
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("earn", "dcd")
// ---------------------------------------------------------------------------
describe('printHelp("earn", "dcd") — dcd subgroup detail', () => {
  it("includes Usage line for earn dcd", () => {
    const out = captureStdout(() => printHelp("earn", "dcd"));
    assert.ok(out.includes("Usage: okx earn dcd"), "should include subgroup usage");
  });

  it("lists all DCD commands", () => {
    const out = captureStdout(() => printHelp("earn", "dcd"));
    for (const cmd of ["pairs", "products", "quote-and-buy", "redeem-execute", "order", "orders"]) {
      assert.ok(out.includes(cmd), `should mention dcd '${cmd}' command`);
    }
  });

  it("includes key flags in usage lines", () => {
    const out = captureStdout(() => printHelp("earn", "dcd"));
    assert.ok(out.includes("--productId"), "should include --productId flag");
    assert.ok(out.includes("--ordId"), "should include --ordId flag");
  });
});

// ---------------------------------------------------------------------------
// Verify backward-compat: existing tests still pass
// ---------------------------------------------------------------------------
describe("printHelp() — backward compatibility", () => {
  it("printHelp() with no args outputs all major module names", () => {
    const out = captureStdout(() => printHelp());
    for (const mod of ["market", "account", "spot", "swap", "futures", "bot", "earn", "config", "setup"]) {
      assert.ok(out.includes(mod), `should include '${mod}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// Global help — additional option checks
// ---------------------------------------------------------------------------
describe("printHelp() — global options completeness", () => {
  it("includes --verbose flag", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("--verbose"), "should mention --verbose option");
  });

  it("includes --version flag", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("--version"), "should mention --version option");
  });

  it("includes diagnose module", () => {
    const out = captureStdout(() => printHelp());
    assert.ok(out.includes("diagnose"), "should mention diagnose module");
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("swap") — has both commands and subgroups
// ---------------------------------------------------------------------------
describe('printHelp("swap") — swap module with algo subgroup', () => {
  it("includes a Usage line", () => {
    const out = captureStdout(() => printHelp("swap"));
    assert.ok(out.includes("Usage: okx swap"), "should include swap usage");
  });

  it("includes all swap direct commands", () => {
    const out = captureStdout(() => printHelp("swap"));
    for (const cmd of ["positions", "orders", "get", "fills", "place", "cancel", "amend", "close", "leverage", "get-leverage", "batch"]) {
      assert.ok(out.includes(cmd), `should mention swap '${cmd}' command`);
    }
  });

  it("mentions algo subgroup", () => {
    const out = captureStdout(() => printHelp("swap"));
    assert.ok(out.includes("algo"), "should mention algo subgroup");
  });

  it("hints to run swap <subgroup> --help", () => {
    const out = captureStdout(() => printHelp("swap"));
    assert.ok(out.includes("--help"), "should hint at running subgroup --help");
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("option") — plain commands only
// ---------------------------------------------------------------------------
describe('printHelp("option") — option module detail', () => {
  it("includes a Usage line", () => {
    const out = captureStdout(() => printHelp("option"));
    assert.ok(out.includes("Usage: okx option"), "should include option usage");
  });

  it("includes all option sub-commands", () => {
    const out = captureStdout(() => printHelp("option"));
    for (const cmd of ["orders", "get", "positions", "fills", "instruments", "greeks", "place", "cancel", "amend", "batch-cancel"]) {
      assert.ok(out.includes(cmd), `should mention option '${cmd}' command`);
    }
  });

  it("includes --uly flag used by greeks and instruments", () => {
    const out = captureStdout(() => printHelp("option"));
    assert.ok(out.includes("--uly"), "should include --uly flag");
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("config") — plain commands only
// ---------------------------------------------------------------------------
describe('printHelp("config") — config module detail', () => {
  it("includes a Usage line", () => {
    const out = captureStdout(() => printHelp("config"));
    assert.ok(out.includes("Usage: okx config"), "should include config usage");
  });

  it("includes all config sub-commands", () => {
    const out = captureStdout(() => printHelp("config"));
    for (const cmd of ["init", "show", "set", "setup-clients"]) {
      assert.ok(out.includes(cmd), `should mention config '${cmd}' command`);
    }
  });
});

// ---------------------------------------------------------------------------
// Module-level help — printHelp("diagnose") — usage-only module
// ---------------------------------------------------------------------------
describe('printHelp("diagnose") — diagnose module with usage only', () => {
  it("includes Usage line with relevant flags", () => {
    const out = captureStdout(() => printHelp("diagnose"));
    assert.ok(out.includes("Usage: okx diagnose"), "should include diagnose usage");
    assert.ok(out.includes("--cli"), "should include --cli flag");
    assert.ok(out.includes("--mcp"), "should include --mcp flag");
  });

  it("includes the module description mentioning diagnostics", () => {
    const out = captureStdout(() => printHelp("diagnose"));
    assert.ok(out.includes("diagnostics"), "should describe diagnostic purpose");
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("earn", "savings")
// ---------------------------------------------------------------------------
describe('printHelp("earn", "savings") — savings subgroup detail', () => {
  it("includes Usage line for earn savings", () => {
    const out = captureStdout(() => printHelp("earn", "savings"));
    assert.ok(out.includes("Usage: okx earn savings"), "should include subgroup usage");
  });

  it("lists all savings commands", () => {
    const out = captureStdout(() => printHelp("earn", "savings"));
    for (const cmd of ["balance", "purchase", "redeem", "set-rate", "lending-history", "rate-history"]) {
      assert.ok(out.includes(cmd), `should mention savings '${cmd}' command`);
    }
  });
});

// ---------------------------------------------------------------------------
// Subgroup-level help — printHelp("earn", "onchain")
// ---------------------------------------------------------------------------
describe('printHelp("earn", "onchain") — onchain subgroup detail', () => {
  it("includes Usage line for earn onchain", () => {
    const out = captureStdout(() => printHelp("earn", "onchain"));
    assert.ok(out.includes("Usage: okx earn onchain"), "should include subgroup usage");
  });

  it("lists all onchain commands", () => {
    const out = captureStdout(() => printHelp("earn", "onchain"));
    for (const cmd of ["offers", "purchase", "redeem", "cancel", "orders", "history"]) {
      assert.ok(out.includes(cmd), `should mention onchain '${cmd}' command`);
    }
  });

  it("includes --productId flag", () => {
    const out = captureStdout(() => printHelp("earn", "onchain"));
    assert.ok(out.includes("--productId"), "should include --productId flag");
  });
});

// ---------------------------------------------------------------------------
// Multi-line usage continuation rendering
// ---------------------------------------------------------------------------
describe("printCommandList — multi-line usage continuation lines", () => {
  it("renders spot algo place continuation lines after the first usage line", () => {
    const out = captureStdout(() => printHelp("spot", "algo"));
    // usage has \n — continuation lines should appear trimmed
    assert.ok(out.includes("--tpTriggerPx"), "should render --tpTriggerPx continuation line");
    assert.ok(out.includes("--slOrdPx"), "should render --slOrdPx continuation line");
  });

  it("renders futures algo trail continuation lines", () => {
    const out = captureStdout(() => printHelp("futures", "algo"));
    assert.ok(out.includes("--activePx"), "should render --activePx continuation line");
    assert.ok(out.includes("--reduceOnly"), "should render --reduceOnly continuation line");
  });

  it("renders earn dcd products multi-line usage continuation", () => {
    const out = captureStdout(() => printHelp("earn", "dcd"));
    assert.ok(out.includes("--minYield"), "should render --minYield continuation line");
    assert.ok(out.includes("--expDate"), "should render --expDate continuation line");
  });
});

// ---------------------------------------------------------------------------
// Market module — additional commands not explicitly checked
// ---------------------------------------------------------------------------
describe('printHelp("market") — additional commands coverage', () => {
  it("includes stock-tokens command", () => {
    const out = captureStdout(() => printHelp("market"));
    assert.ok(out.includes("stock-tokens"), "should mention stock-tokens command");
  });

  it("includes price-limit command", () => {
    const out = captureStdout(() => printHelp("market"));
    assert.ok(out.includes("price-limit"), "should mention price-limit command");
  });
});

// ---------------------------------------------------------------------------
// Error handling — unknown module in printSubgroupHelp
// ---------------------------------------------------------------------------
describe("printHelp() — error handling edge cases", () => {
  it("sets exitCode=1 for unknown module when two path args given", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => printHelp("nonexistent-module", "somecmd"));
    assert.ok(err.includes("Unknown module"), "should report unknown module");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  it("writes error to stderr for known module with no subgroups queried as subgroup", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => printHelp("market", "nonexistent-subgroup"));
    assert.ok(err.includes("Unknown subgroup"), "should report unknown subgroup for market");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });
});
