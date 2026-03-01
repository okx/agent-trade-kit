import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, toToolErrorPayload, checkForUpdates } from "@okx-hub/core";
import { SERVER_VERSION } from "./constants.js";
import { createServer } from "./server.js";

function printHelp(): void {
  const help = `
Usage: okx-mcp-server [options]

Options:
  --modules <list>     Comma-separated list of modules to load
                       Available: market, spot, swap, account
                       Special: "all" loads all modules
                       Default: spot,swap,account

  --profile <name>     Profile to load from ~/.okx/config.toml
                       Falls back to default_profile in config, then "default"
  --read-only          Expose only read/query tools and disable write operations
  --demo               Enable simulated trading (injects x-simulated-trading: 1)
  --help               Show this help message
  --version            Show version

Credentials (priority: env vars > ~/.okx/config.toml > none):
  OKX_API_KEY          OKX API key
  OKX_SECRET_KEY       OKX secret key
  OKX_PASSPHRASE       OKX passphrase

Other Environment Variables:
  OKX_API_BASE_URL     Optional API base URL (default: https://www.okx.com)
  OKX_TIMEOUT_MS       Optional request timeout in milliseconds (default: 15000)
`;
  process.stdout.write(help);
}

function parseCli(): {
  modules?: string;
  profile?: string;
  readOnly: boolean;
  demo: boolean;
  help: boolean;
  version: boolean;
} {
  const parsed = parseArgs({
    options: {
      modules: { type: "string" },
      profile: { type: "string" },
      "read-only": { type: "boolean", default: false },
      demo: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  return {
    modules: parsed.values.modules,
    profile: parsed.values.profile,
    readOnly: parsed.values["read-only"] ?? false,
    demo: parsed.values.demo ?? false,
    help: parsed.values.help ?? false,
    version: parsed.values.version ?? false,
  };
}

export async function main(): Promise<void> {
  checkForUpdates("okx-mcp-server", SERVER_VERSION);

  const cli = parseCli();

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.version) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  const config = loadConfig({
    modules: cli.modules,
    profile: cli.profile,
    readOnly: cli.readOnly,
    demo: cli.demo,
  });
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
