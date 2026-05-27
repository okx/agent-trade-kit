import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { outputLine, errorLine } from "../formatter.js";
import type { CliValues } from "../parser.js";

const PREDICT_BINARY_NAME =
  process.platform === "win32" ? "okx-predict.exe" : "okx-predict";

// Locate the okx-predict binary: OKX_PREDICT_BIN override → PATH search.
function resolvePredictBinaryPath(): string | null {
  const override = process.env.OKX_PREDICT_BIN;
  if (override && existsSync(override)) return override;

  const paths = (process.env.PATH ?? "").split(delimiter);
  for (const dir of paths) {
    if (!dir) continue;
    const full = join(dir, PREDICT_BINARY_NAME);
    if (existsSync(full)) return full;
  }
  return null;
}

function printInstallHint(): void {
  errorLine("Error: okx-predict binary not found in PATH.");
  errorLine("");
  errorLine("Install it via:");
  errorLine("  npm install -g @okx/predict-market-cli");
  errorLine("");
  errorLine("Or set OKX_PREDICT_BIN env var to a custom binary path.");
}

function runOkxPredict(args: string[]): Promise<number> {
  const binPath = resolvePredictBinaryPath();
  if (!binPath) {
    printInstallHint();
    return Promise.resolve(127);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { stdio: "inherit" });
    child.on("error", (err) =>
      reject(new Error(`Failed to spawn okx-predict: ${err.message}`)),
    );
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function printPredictionHelp(): void {
  const lines = [
    "Usage: okx prediction <command> [args...]",
    "",
    "Prediction markets - YES/NO event contract trading via @okx/predict-market-cli.",
    "",
    "Common commands:",
    "  data events                     List prediction events",
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
    "  clob cancel-oid | cancel-client-order-id | cancel-all | heartbeat",
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
    "Run 'okx prediction <command> --help' for command-specific help.",
    "",
    "Requires: npm install -g @okx/predict-market-cli",
  ];
  for (const line of lines) outputLine(line);
}

// The caller (index.ts) routes prediction via peekFirstPositional + raw-argv
// slicing, BEFORE parseCli runs. That means action+rest reach us already as
// the verbatim tokens that followed the literal `prediction` module keyword —
// no parser consumed --status / --limit / --bar etc. We simply forward them.
export async function handlePredictionCommand(
  action: string | undefined,
  rest: string[],
  v: CliValues,
): Promise<void> {
  if (!action || action === "--help" || action === "-h" || action === "help") {
    printPredictionHelp();
    return;
  }

  const forwardArgs = [action, ...rest];

  if (v.json && !forwardArgs.includes("--json") && !forwardArgs.includes("-j")) {
    forwardArgs.push("--json");
  }

  const code = await runOkxPredict(forwardArgs);
  if (code !== 0) process.exitCode = code;
}
