export const OKX_API_BASE_URL = "https://www.okx.com";

export const MODULES = [
  "market",
  "spot",
  "swap",
  "futures",
  "account",
] as const;

export type ModuleId = (typeof MODULES)[number];

export const DEFAULT_MODULES: ModuleId[] = ["spot", "swap", "account"];
