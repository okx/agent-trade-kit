import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { outputLine, errorLine } from "../formatter.js";
import type { CliValues } from "../parser.js";

const OUTCOMES_BINARY_NAME =
  process.platform === "win32" ? "okx-outcomes.exe" : "okx-outcomes";

function resolveOutcomesBinaryPath(): string | null {
  const override = process.env.OKX_OUTCOMES_BIN;
  if (override && existsSync(override)) return override;

  const paths = (process.env.PATH ?? "").split(delimiter);
  for (const dir of paths) {
    if (!dir) continue;
    const full = join(dir, OUTCOMES_BINARY_NAME);
    if (existsSync(full)) return full;
  }
  return null;
}

function printInstallHint(): void {
  errorLine("Error: okx-outcomes binary not found in PATH.");
  errorLine("");
  errorLine("Install (macOS / Linux):");
  errorLine("  curl -fsSL https://raw.githubusercontent.com/okx/outcomes/master/install.sh | sh");
  errorLine("");
  errorLine("Install (Windows): download okx-outcomes.exe from");
  errorLine("  https://github.com/okx/outcomes/releases");
  errorLine("and place it on your PATH.");
  errorLine("");
  errorLine("Or set OKX_OUTCOMES_BIN env var to a custom binary path.");
}

function runOkxOutcomes(args: string[]): Promise<number> {
  const binPath = resolveOutcomesBinaryPath();
  if (!binPath) {
    printInstallHint();
    return Promise.resolve(127);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { stdio: "inherit" });
    child.on("error", (err) =>
      reject(new Error(`Failed to spawn okx-outcomes: ${err.message}`)),
    );
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function printOutcomesHelp(): void {
  const lines = [
    "Usage: okx outcomes <command> [args...]",
    "",
    "OKX Outcomes - YES/NO event contract trading via the okx-outcomes binary.",
    "",
    "Common commands:",
    "  data events                     List outcome events",
    "  data event <eventId>            Get event detail",
    "  data event-markets <eventId>    Event + all its markets (returns asset ids)",
    "  data market <marketId>          Get single market detail",
    "  data trending                   List trending events",
    "  data ticker <assetId>           24h ticker for an outcome asset",
    "  data candles <assetId>          OHLCV candles for an outcome asset",
    "  search <keyword>                Search events/markets",
    "  (Note: events/event/market etc. live UNDER the `data` namespace — calling them",
    "         as top-level commands prints the binary's help instead of returning JSON.)",
    "",
    "  clob price/prices/midpoint(s)/spread(s)/book(s) --asset <id>",
    "                                  CLOB read-side market data",
    "  clob create-order               Place limit order (EIP-712 signed)",
    "  clob market-order               Cross book immediately (IOC/FOK)",
    "  clob cancel-oid | cancel-all | heartbeat",
    "",
    "  ctf split/merge/redeem          Conditional token operations",
    "",
    "  account balance/order/orders/positions/closed-positions/trades",
    "                                  HMAC-auth account queries",
    "",
    "  wallet show                     Show derived wallet address",
    "  status                          Health check",
    "  setup                           Interactive .env wizard",
    "",
    "Run 'okx outcomes <command> --help' for command-specific help.",
    "",
    "Requires: curl -fsSL https://raw.githubusercontent.com/okx/outcomes/master/install.sh | sh",
  ];
  for (const line of lines) outputLine(line);
}

// The caller (index.ts) routes outcomes via peekFirstPositional + raw-argv
// slicing, BEFORE parseCli runs. That means action+rest reach us already as
// the verbatim tokens that followed the literal `outcomes` module keyword —
// no parser consumed --status / --limit / --bar etc. We simply forward them.
export async function handleOutcomesCommand(
  action: string | undefined,
  rest: string[],
  v: CliValues,
): Promise<void> {
  if (!action || action === "--help" || action === "-h" || action === "help") {
    printOutcomesHelp();
    return;
  }

  const forwardArgs = [action, ...rest];

  if (v.json && !forwardArgs.includes("--json") && !forwardArgs.includes("-j")) {
    forwardArgs.push("--json");
  }

  const code = await runOkxOutcomes(forwardArgs);
  if (code !== 0) process.exitCode = code;
}
