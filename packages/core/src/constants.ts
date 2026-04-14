export const OKX_API_BASE_URL = "https://www.okx.com";

/** Default source tag injected into all order placements for attribution. */
export const DEFAULT_SOURCE_TAG = "MCP";

// ---------------------------------------------------------------------------
// Site registry
// ---------------------------------------------------------------------------

export interface OkxSite {
  label: string;
  apiBaseUrl: string;
  /** User-facing web URL for account/API key management pages */
  webUrl: string;
}

export const OKX_SITES = {
  global: {
    label: "Global",
    apiBaseUrl: "https://www.okx.com",
    webUrl: "https://www.okx.com",
  },
  eea: {
    label: "EEA",
    apiBaseUrl: "https://eea.okx.com",
    webUrl: "https://my.okx.com",
  },
  us: {
    label: "US",
    apiBaseUrl: "https://app.okx.com",
    webUrl: "https://app.okx.com",
  },
} as const satisfies Record<string, OkxSite>;

export type SiteId = keyof typeof OKX_SITES;
export const SITE_IDS = Object.keys(OKX_SITES) as SiteId[];

export const BOT_SUB_MODULE_IDS = [
  "bot.grid",
  "bot.dca",
] as const;

export type BotSubModuleId = (typeof BOT_SUB_MODULE_IDS)[number];

export const BOT_DEFAULT_SUB_MODULES: BotSubModuleId[] = ["bot.grid"];

export const EARN_SUB_MODULE_IDS = [
  "earn.savings",
  "earn.onchain",
  "earn.dcd",
  "earn.autoearn",
  "earn.flash",
] as const;

export type EarnSubModuleId = (typeof EARN_SUB_MODULE_IDS)[number];

export const MODULES = [
  "market",
  "spot",
  "swap",
  "futures",
  "option",
  "account",
  "event",
  "news",
  ...EARN_SUB_MODULE_IDS,
  ...BOT_SUB_MODULE_IDS,
  "skills",
] as const;

export type ModuleId = (typeof MODULES)[number];

export const DEFAULT_MODULES: ModuleId[] = ["spot", "swap", "option", "account", ...BOT_DEFAULT_SUB_MODULES, "skills"];
// Default: spot, swap, option, account, bot.grid
// "all": every module including market, futures, bot.dca, earn.savings, earn.onchain, earn.dcd, earn.autoearn, earn.flash
// "bot": bot.grid only; "bot.all": bot.grid + bot.dca
// "earn" / "earn.all": all earn sub-modules (earn.savings + earn.onchain + earn.dcd + earn.autoearn + earn.flash)
// "earn.savings": Simple Earn only; "earn.onchain": On-chain Earn only; "earn.dcd": Dual Currency Deposit only; "earn.autoearn": Auto-Earn only; "earn.flash": Flash Earn only

// ---------------------------------------------------------------------------
// Module descriptions — canonical single source of truth used by CLI help and
// MCP tool descriptions.  Keys include all ModuleId values plus CLI-only modules.
// ---------------------------------------------------------------------------

export type CliModuleKey =
  | ModuleId
  | "earn"
  | "bot"
  | "config"
  | "setup"
  | "doh"
  | "diagnose"
  | "upgrade"
  | "skill";

const SKILLS_MARKETPLACE_DESC = "OKX Skills Marketplace — search, install, and manage agent skills";

export const MODULE_DESCRIPTIONS: Record<CliModuleKey, string> = {
  market:          "Market data (ticker, orderbook, candles, trades)",
  spot:            "Spot trading (orders, algo orders)",
  swap:            "Perpetual swap trading (orders, algo orders)",
  futures:         "Futures trading (orders, positions, algo orders, leverage)",
  option:          "Options trading (orders, positions, greeks)",
  account:         "Account balance, positions, bills, and configuration",
  "earn.savings":  "Simple Earn — flexible savings, fixed-term, and lending",
  "earn.onchain":  "On-chain Earn — staking and DeFi products",
  "earn.dcd":      "DCD (Dual Currency Deposit) — structured products with fixed yield",
  "earn.autoearn": "Auto-earn — automatically lend, stake, or earn on idle assets",
  "earn.flash":    "Flash Earn — short-window high-yield earn projects",
  event:           "Event contracts — binary prediction markets (YES/NO, UP/DOWN)",
  "bot.grid":      "Grid trading bot — create, monitor, and stop grid orders",
  "bot.dca":       "DCA (Martingale) bot — spot or contract recurring buys",
  news:            "Crypto news, sentiment analysis, and coin trend tracking",
  skills:          SKILLS_MARKETPLACE_DESC,
  earn:            "Earn products — Simple Earn, On-chain Earn, DCD, Flash Earn, and Auto-Earn",
  bot:             "Trading bot strategies (grid, dca)",
  config:          "Manage CLI configuration profiles",
  setup:           "Set up client integrations (Cursor, Windsurf, Claude, etc.)",
  doh:             "Manage DoH (DNS-over-HTTPS) resolver binary",
  diagnose:        "Run network / MCP server diagnostics",
  upgrade:         "Upgrade okx CLI and MCP server to the latest stable version",
  skill:           SKILLS_MARKETPLACE_DESC,
};
