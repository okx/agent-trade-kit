import { BOT_MODULE_IDS, DEFAULT_MODULES, MODULES, OKX_API_BASE_URL, OKX_SITES, SITE_IDS, type ModuleId, type SiteId } from "./constants.js";
import { ConfigError } from "./utils/errors.js";
import { readTomlProfile } from "./config/toml.js";

export interface CliOptions {
  modules?: string;
  readOnly: boolean;
  demo: boolean;
  profile?: string;
  site?: string;
  userAgent?: string;
}

export interface OkxConfig {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  hasAuth: boolean;
  baseUrl: string;
  timeoutMs: number;
  modules: ModuleId[];
  readOnly: boolean;
  demo: boolean;
  site: SiteId;
  userAgent?: string;
}

function parseModuleList(rawModules?: string): ModuleId[] {
  if (!rawModules || rawModules.trim().length === 0) {
    return [...DEFAULT_MODULES];
  }

  const trimmed = rawModules.trim().toLowerCase();
  if (trimmed === "all") {
    return [...MODULES];
  }

  const requested = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (requested.length === 0) {
    return [...DEFAULT_MODULES];
  }

  const deduped = new Set<ModuleId>();
  for (const moduleId of requested) {
    // "bot" is a convenience alias that expands to all bot sub-modules
    if (moduleId === "bot") {
      BOT_MODULE_IDS.forEach((id) => deduped.add(id));
      continue;
    }
    if (!MODULES.includes(moduleId as ModuleId)) {
      throw new ConfigError(
        `Unknown module "${moduleId}".`,
        `Use one of: ${MODULES.join(", ")}, "bot" (alias for all bot sub-modules), or "all".`,
      );
    }
    deduped.add(moduleId as ModuleId);
  }

  return Array.from(deduped);
}

/**
 * Credential priority (highest to lowest):
 *   1. Environment variables (OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE)
 *   2. ~/.okx/config.toml  — profile selected by cli.profile or default_profile
 *
 * Site priority (highest to lowest):
 *   1. cli.site arg
 *   2. OKX_SITE env var
 *   3. toml profile site field
 *   4. default: "global"
 *
 * Base URL priority (highest to lowest):
 *   1. OKX_API_BASE_URL env var  (explicit override — advanced users)
 *   2. toml profile base_url
 *   3. site's apiBaseUrl (auto-derived from site)
 */
export function loadConfig(cli: CliOptions): OkxConfig {
  // Read toml profile as fallback
  const toml = readTomlProfile(cli.profile);

  const apiKey = process.env.OKX_API_KEY?.trim() ?? toml.api_key;
  const secretKey = process.env.OKX_SECRET_KEY?.trim() ?? toml.secret_key;
  const passphrase = process.env.OKX_PASSPHRASE?.trim() ?? toml.passphrase;

  const hasAuth = Boolean(apiKey && secretKey && passphrase);
  const partialAuth = Boolean(apiKey) || Boolean(secretKey) || Boolean(passphrase);

  if (partialAuth && !hasAuth) {
    throw new ConfigError(
      "Partial API credentials detected.",
      "Set OKX_API_KEY, OKX_SECRET_KEY and OKX_PASSPHRASE together (env vars or config.toml profile).",
    );
  }

  // demo flag: cli arg > env var > toml profile
  const demo =
    cli.demo ||
    process.env.OKX_DEMO === "1" ||
    process.env.OKX_DEMO === "true" ||
    (toml.demo ?? false);

  // site: cli arg > env var > toml profile > default "global"
  const rawSite = cli.site?.trim() ?? process.env.OKX_SITE?.trim() ?? toml.site ?? "global";
  if (!SITE_IDS.includes(rawSite as SiteId)) {
    throw new ConfigError(
      `Unknown site "${rawSite}".`,
      `Use one of: ${SITE_IDS.join(", ")}.`,
    );
  }
  const site = rawSite as SiteId;

  // base url: env var > toml profile > site's apiBaseUrl
  const rawBaseUrl =
    process.env.OKX_API_BASE_URL?.trim() ?? toml.base_url ?? OKX_SITES[site].apiBaseUrl;
  if (!rawBaseUrl.startsWith("http://") && !rawBaseUrl.startsWith("https://")) {
    throw new ConfigError(
      `Invalid base URL "${rawBaseUrl}".`,
      "OKX_API_BASE_URL must start with http:// or https://",
    );
  }
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");

  // timeout: env var > toml profile > default
  const rawTimeout = process.env.OKX_TIMEOUT_MS
    ? Number(process.env.OKX_TIMEOUT_MS)
    : (toml.timeout_ms ?? 15_000);
  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    throw new ConfigError(
      `Invalid timeout value "${rawTimeout}".`,
      "Set OKX_TIMEOUT_MS as a positive integer in milliseconds.",
    );
  }

  return {
    apiKey,
    secretKey,
    passphrase,
    hasAuth,
    baseUrl,
    timeoutMs: Math.floor(rawTimeout),
    modules: parseModuleList(cli.modules),
    readOnly: cli.readOnly,
    demo,
    site,
    userAgent: cli.userAgent,
  };
}
