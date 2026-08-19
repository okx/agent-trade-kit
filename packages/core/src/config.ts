import { BOT_DEFAULT_SUB_MODULES, BOT_SUB_MODULE_IDS, EARN_SUB_MODULE_IDS, DEFAULT_MODULES, DEFAULT_SOURCE_TAG, MODULES, OKX_SITES, SITE_IDS, type ModuleId, type SiteId } from "./constants.js";
import { ConfigError } from "./utils/errors.js";
import { readFullConfig } from "./config/toml.js";
import type { OkxProfile } from "./config/toml.js";
import { execAuthStatus } from "./auth/binary.js";

export interface CliOptions {
  modules?: string;
  readOnly: boolean;
  demo?: boolean;
  live?: boolean;
  profile?: string;
  site?: string;
  userAgent?: string;
  sourceTag?: string;
  verbose?: boolean;
}

export interface OkxConfig {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  /** True if any credentials are available (OAuth token OR API key). */
  hasAuth: boolean;
  /** Resolved profile name - used for OAuth token storage path. */
  profile: string;
  baseUrl: string;
  timeoutMs: number;
  modules: ModuleId[];
  readOnly: boolean;
  demo: boolean;
  site: SiteId;
  userAgent?: string;
  sourceTag: string;
  proxyUrl?: string;
  verbose: boolean;
}

/**
 * Expand a single module shorthand into its concrete sub-module IDs.
 * Returns the expanded IDs, or null if the input is not a shorthand.
 */
function expandShorthand(moduleId: string): ModuleId[] | null {
  // "all" expands to every known module (base + bot sub-modules + earn sub-modules)
  if (moduleId === "all") return [...MODULES];
  if (moduleId === "earn" || moduleId === "earn.all") return [...EARN_SUB_MODULE_IDS];
  if (moduleId === "bot") return [...BOT_DEFAULT_SUB_MODULES];
  if (moduleId === "bot.all") return [...BOT_SUB_MODULE_IDS];
  return null;
}

function parseModuleList(rawModules?: string): ModuleId[] {
  if (!rawModules || rawModules.trim().length === 0) {
    return [...DEFAULT_MODULES];
  }

  const trimmed = rawModules.trim().toLowerCase();
  const requested = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (requested.length === 0) {
    return [...DEFAULT_MODULES];
  }

  const deduped = new Set<ModuleId>();
  for (const moduleId of requested) {
    const expanded = expandShorthand(moduleId);
    if (expanded) {
      expanded.forEach((sub) => deduped.add(sub));
      continue;
    }
    if (!MODULES.includes(moduleId as ModuleId)) {
      throw new ConfigError(
        `Unknown module "${moduleId}".`,
        `Use one of: ${MODULES.join(", ")}, "earn", "earn.all", "bot", "bot.all", or "all".`,
      );
    }
    deduped.add(moduleId as ModuleId);
  }

  return Array.from(deduped);
}

async function loadCredentials(toml: OkxProfile): Promise<{ apiKey?: string; secretKey?: string; passphrase?: string; hasAuth: boolean; oauthSite?: SiteId }> {
  const apiKey = process.env.OKX_API_KEY?.trim() ?? toml.api_key;
  const secretKey = process.env.OKX_SECRET_KEY?.trim() ?? toml.secret_key;
  const passphrase = process.env.OKX_PASSPHRASE?.trim() ?? toml.passphrase;
  const hasApiKey = Boolean(apiKey && secretKey && passphrase);
  const partialAuth = Boolean(apiKey) || Boolean(secretKey) || Boolean(passphrase);
  if (partialAuth && !hasApiKey) {
    throw new ConfigError(
      "Partial API credentials detected.",
      "Set OKX_API_KEY, OKX_SECRET_KEY and OKX_PASSPHRASE together (env vars or config.toml profile).",
    );
  }

  // hasAuth = true if either OAuth tokens (via okx-auth binary) or API key exists
  // Auth mode is determined dynamically by rest-client at request time.
  //
  // When authenticating via OAuth, the token is issued per-site (okx-auth login
  // --site <x>) and only works against that site's API host. We surface the
  // session's site so resolveSite() can route requests to the correct host by
  // default, instead of the blind "global" fallback. Source of truth is the
  // okx-auth binary; we only read it, never persist it.
  let hasOAuth = false;
  let oauthSite: SiteId | undefined;
  if (!hasApiKey) {
    const status = await execAuthStatus();
    hasOAuth = status?.status === "logged_in";
    if (hasOAuth && status?.site) {
      if (SITE_IDS.includes(status.site as SiteId)) {
        oauthSite = status.site as SiteId;
      } else {
        // Unrecognized site from the binary: warn rather than silently ignoring
        // it, so a future binary value-set change is not masked. We only drop the
        // OAuth site here; normal site resolution (explicit value, else global)
        // still applies, so avoid claiming a specific fallback target.
        process.stderr.write(
          `[okx] warning: OAuth login site "${status.site}" is not recognized; ` +
          `ignoring it and continuing normal site resolution. Update the CLI if this persists.\n`,
        );
      }
    }
  }
  const hasAuth = hasOAuth || hasApiKey;

  return { apiKey, secretKey, passphrase, hasAuth, oauthSite };
}

function resolveSite(cliSite?: string, tomlSite?: string, oauthSite?: SiteId, verbose = false): SiteId {
  // `explicit` = a site the user actively specified (cli / env / toml). Each
  // string source is trimmed and an empty/whitespace value (`--site ""`,
  // `OKX_SITE=""`, toml `site = ""`) is normalized to `undefined` so it is
  // skipped rather than treated as an explicit selection; the `??` chain then
  // falls through to the next source (and ultimately to `oauthSite`/`"global"`).
  //
  // `toml.site` comes from an unchecked TOML parse, so guard its type: any
  // non-string value (e.g. `site = 123`, `site = 0`, `site = false`) is passed
  // through unchanged so the SITE_IDS check below rejects it with a clean
  // "Unknown site" ConfigError, instead of a TypeError (from `.trim()`) or being
  // silently dropped by a truthiness test.
  const tomlSiteValue = typeof tomlSite === "string" ? (tomlSite.trim() || undefined) : tomlSite;
  const explicit = (cliSite?.trim() || undefined) ?? (process.env.OKX_SITE?.trim() || undefined) ?? tomlSiteValue;
  // Priority: explicit > OAuth session site > "global".
  const rawSite = explicit ?? oauthSite ?? "global";

  // Validate before any warning so a typo/unknown site (e.g. "EEA") produces a
  // clear "Unknown site" error rather than a misleading conflict warning.
  if (!SITE_IDS.includes(rawSite as SiteId)) {
    throw new ConfigError(
      `Unknown site "${rawSite}".`,
      `Use one of: ${SITE_IDS.join(", ")}.`,
    );
  }

  // Warn only when the user explicitly picked a site that conflicts with the
  // OAuth session's site — that combination will 401 on private requests. Do
  // NOT warn on the normal auto-route path (no explicit site, OAuth site used),
  // which is exactly the behavior this fallback is meant to provide silently.
  if (explicit !== undefined && oauthSite !== undefined && explicit !== oauthSite) {
    process.stderr.write(
      `[okx] warning: requested site "${explicit}" differs from your OAuth login site "${oauthSite}"; ` +
      `private requests may return 401. Drop --site/OKX_SITE/toml site to use the login site.\n`,
    );
  } else if (verbose && explicit === undefined && oauthSite !== undefined) {
    process.stderr.write(`[verbose] site=${oauthSite} (from OAuth login)\n`);
  }

  return rawSite as SiteId;
}

function resolveBaseUrl(site: SiteId, tomlBaseUrl?: string): string {
  const rawBaseUrl =
    process.env.OKX_API_BASE_URL?.trim() ?? tomlBaseUrl ?? OKX_SITES[site].apiBaseUrl;
  if (!rawBaseUrl.startsWith("http://") && !rawBaseUrl.startsWith("https://")) {
    throw new ConfigError(
      `Invalid base URL "${rawBaseUrl}".`,
      "OKX_API_BASE_URL must start with http:// or https://",
    );
  }
  return rawBaseUrl.replace(/\/+$/, "");
}

/**
 * Credential priority (highest to lowest):
 *   1. Environment variables (OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE)
 *   2. ~/.okx/config.toml  - profile selected by cli.profile or default_profile
 *
 * Site priority (highest to lowest):
 *   1. cli.site arg
 *   2. OKX_SITE env var
 *   3. toml profile site field
 *   4. OAuth session site (the site the OAuth token was issued for)
 *   5. default: "global"
 *
 * Base URL priority (highest to lowest):
 *   1. OKX_API_BASE_URL env var  (explicit override - advanced users)
 *   2. toml profile base_url
 *   3. site's apiBaseUrl (auto-derived from site)
 */

function resolveDemo(cli: CliOptions, toml: OkxProfile): boolean {
  if (cli.demo && cli.live) {
    throw new ConfigError(
      "--demo and --live are mutually exclusive.",
      "Use --demo for simulated trading or --live to force live mode, not both.",
    );
  }
  if (cli.live === true) return false;
  if (cli.demo === true) return true;
  return process.env.OKX_DEMO === "1" ||
    process.env.OKX_DEMO === "true" ||
    (toml.demo ?? false);
}

export async function loadConfig(cli: CliOptions): Promise<OkxConfig> {
  const config = readFullConfig();
  const profileName = cli.profile ?? config.default_profile ?? "default";
  const toml = config.profiles?.[profileName] ?? {};
  const { oauthSite, ...creds } = await loadCredentials(toml);

  const demo = resolveDemo(cli, toml);

  const site = resolveSite(cli.site, toml.site, oauthSite, cli.verbose ?? false);
  const baseUrl = resolveBaseUrl(site, toml.base_url);

  const rawTimeout = process.env.OKX_TIMEOUT_MS
    ? Number(process.env.OKX_TIMEOUT_MS)
    : (toml.timeout_ms ?? 15_000);
  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    throw new ConfigError(
      `Invalid timeout value "${rawTimeout}".`,
      "Set OKX_TIMEOUT_MS as a positive integer in milliseconds.",
    );
  }

  // proxy: toml profile only (no env vars - keep it explicit)
  const rawProxyUrl = toml.proxy_url?.trim();
  if (rawProxyUrl && !rawProxyUrl.startsWith("http://") && !rawProxyUrl.startsWith("https://")) {
    throw new ConfigError(
      `Invalid proxy URL "${rawProxyUrl}".`,
      "proxy_url must start with http:// or https://. SOCKS proxies are not supported.",
    );
  }

  return {
    ...creds,
    profile: profileName,
    baseUrl,
    timeoutMs: Math.floor(rawTimeout),
    modules: parseModuleList(cli.modules),
    readOnly: cli.readOnly,
    demo,
    site,
    userAgent: cli.userAgent,
    sourceTag: cli.sourceTag ?? DEFAULT_SOURCE_TAG,
    proxyUrl: rawProxyUrl || undefined,
    verbose: cli.verbose ?? false,
  };
}
