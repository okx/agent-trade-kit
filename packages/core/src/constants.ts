export const OKX_API_BASE_URL = "https://www.okx.com";

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

export const BOT_MODULE_IDS = [
  "bot-grid",
  "bot-dca",
  "bot-contract-dca",
  "bot-recurring",
] as const;

export const MODULES = [
  "market",
  "spot",
  "swap",
  "futures",
  "option",
  "account",
  ...BOT_MODULE_IDS,
] as const;

export type ModuleId = (typeof MODULES)[number];

export const DEFAULT_MODULES: ModuleId[] = ["spot", "swap", "account", "bot-grid"];
