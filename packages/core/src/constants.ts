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
] as const;

export type EarnSubModuleId = (typeof EARN_SUB_MODULE_IDS)[number];

export const MODULES = [
  "market",
  "spot",
  "swap",
  "futures",
  "option",
  "account",
  "news",
  ...EARN_SUB_MODULE_IDS,
  ...BOT_SUB_MODULE_IDS,
  "skills",
] as const;

export type ModuleId = (typeof MODULES)[number];

export const DEFAULT_MODULES: ModuleId[] = ["spot", "swap", "option", "account", ...BOT_DEFAULT_SUB_MODULES, "skills"];
// Default: spot, swap, option, account, bot.grid
// "all": every module including market, futures, bot.dca, earn.savings, earn.onchain, earn.dcd
// "bot": bot.grid only; "bot.all": bot.grid + bot.dca
// "earn" / "earn.all": all earn sub-modules (earn.savings + earn.onchain + earn.dcd)
// "earn.savings": Simple Earn only; "earn.onchain": On-chain Earn only; "earn.dcd": Dual Currency Deposit only
