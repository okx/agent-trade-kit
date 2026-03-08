import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  loadConfig,
  toToolErrorPayload,
  checkForUpdates,
  TradeLogger,
  runSetup,
  printSetupUsage,
  SUPPORTED_CLIENTS,
  configFilePath,
} from "@agent-tradekit/core";
import type { LogLevel, ClientId } from "@agent-tradekit/core";
import { SERVER_NAME, SERVER_VERSION, GIT_HASH } from "./constants.js";
import { createServer } from "./server.js";

function printHelp(): void {
  const help = `
Usage: okx-trade-mcp [options]

Options:
  --modules <list>     Comma-separated list of modules to load
                       Available: market, spot, swap, futures, option, account
                                  bot.grid, bot.dca
                       Alias: "bot" = all bot sub-modules (bot.grid + bot.dca)
                       Special: "all" loads all modules
                       Default: spot,swap,option,account,bot.grid

  --profile <name>     Profile to load from ${configFilePath()}
                       Falls back to default_profile in config, then "default"
  --site <site>        OKX site to connect to: global, eea, us (default: global)
                       global → www.okx.com, eea → eea.okx.com, us → app.okx.com
  --read-only          Expose only read/query tools and disable write operations
  --demo               Enable simulated trading (injects x-simulated-trading: 1)
  --no-log             Disable audit logging (default: logging enabled)
  --log-level <level>  Minimum log level to write: error, warn, info, debug (default: info)
  --help               Show this help message
  --version            Show version

Credentials (priority: env vars > ${configFilePath()} > none):
  OKX_API_KEY          OKX API key
  OKX_SECRET_KEY       OKX secret key
  OKX_PASSPHRASE       OKX passphrase

Other Environment Variables:
  OKX_SITE             OKX site: global, eea, us (overridden by --site flag)
  OKX_API_BASE_URL     Optional API base URL override (overrides --site mapping)
  OKX_TIMEOUT_MS       Optional request timeout in milliseconds (default: 15000)
`;
  process.stdout.write(help);
}

function parseCli(): {
  modules?: string;
  profile?: string;
  site?: string;
  readOnly: boolean;
  demo: boolean;
  noLog: boolean;
  logLevel: string;
  help: boolean;
  version: boolean;
} {
  const parsed = parseArgs({
    options: {
      modules: { type: "string" },
      profile: { type: "string" },
      site: { type: "string" },
      "read-only": { type: "boolean", default: false },
      demo: { type: "boolean", default: false },
      "no-log": { type: "boolean", default: false },
      "log-level": { type: "string", default: "info" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  return {
    modules: parsed.values.modules,
    profile: parsed.values.profile,
    site: parsed.values.site,
    readOnly: parsed.values["read-only"] ?? false,
    demo: parsed.values.demo ?? false,
    noLog: parsed.values["no-log"] ?? false,
    logLevel: parsed.values["log-level"] ?? "info",
    help: parsed.values.help ?? false,
    version: parsed.values.version ?? false,
  };
}

function handleSetup(): void {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      client: { type: "string" },
      profile: { type: "string" },
      modules: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.client) {
    printSetupUsage();
    return;
  }

  if (!SUPPORTED_CLIENTS.includes(values.client as ClientId)) {
    process.stderr.write(
      `Unknown client: "${values.client}"\nSupported: ${SUPPORTED_CLIENTS.join(", ")}\n`
    );
    process.exitCode = 1;
    return;
  }

  runSetup({
    client: values.client as ClientId,
    profile: values.profile,
    modules: values.modules,
  });
}

export async function main(): Promise<void> {
  if (process.argv[2] === "setup") {
    handleSetup();
    return;
  }

  checkForUpdates("@okx_ai/okx-trade-mcp", SERVER_VERSION);

  const cli = parseCli();

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.version) {
    process.stdout.write(`${SERVER_VERSION} (${GIT_HASH})\n`);
    return;
  }

  const config = loadConfig({
    modules: cli.modules,
    profile: cli.profile,
    site: cli.site,
    readOnly: cli.readOnly,
    demo: cli.demo,
    userAgent: `${SERVER_NAME}/${SERVER_VERSION}`,
  });
  const logger = cli.noLog ? undefined : new TradeLogger(cli.logLevel as LogLevel);
  const server = createServer(config, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
