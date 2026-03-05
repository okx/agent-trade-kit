import type { OkxConfig } from "@agent-tradekit/core";
import { loadConfig } from "@agent-tradekit/core";

export interface LoadProfileOptions {
  profile?: string;
  modules?: string;
  readOnly?: boolean;
  demo?: boolean;
  site?: string;
  userAgent?: string;
}

/**
 * Load config for CLI commands.
 * Delegates to core's loadConfig which handles the full priority chain:
 *   env vars > ~/.okx/config.toml (selected profile) > defaults
 */
export function loadProfileConfig(opts: LoadProfileOptions): OkxConfig {
  return loadConfig({
    profile: opts.profile,
    modules: opts.modules,
    readOnly: opts.readOnly ?? false,
    demo: opts.demo ?? false,
    site: opts.site,
    userAgent: opts.userAgent,
  });
}
