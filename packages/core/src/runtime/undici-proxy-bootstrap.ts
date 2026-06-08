// Side-effect module: registers EnvHttpProxyAgent as the global undici
// dispatcher so that HTTPS_PROXY / HTTP_PROXY / NO_PROXY env vars are
// honored by all undici fetch calls (Node's built-in fetch is undici-backed).
//
// Import order matters: this must be imported before any fetch calls occur.
// Per-request `dispatcher` options always override the global dispatcher,
// so existing explicit-proxy users (e.g. config.proxyUrl → ProxyAgent) are unaffected.
//
// Registration is gated on the presence of a proxy env var. EnvHttpProxyAgent
// is still flagged experimental by Node, so instantiating it unconditionally
// emits an ExperimentalWarning on every command (including local-only ones like
// `skill list` that never make a request). Gating keeps the auto-proxy behavior
// for users who need it while staying silent for everyone else.
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/** True when any proxy env var (upper- or lower-case) is set. */
export function hasProxyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy,
  );
}

/**
 * Registers EnvHttpProxyAgent as the global undici dispatcher, but only when a
 * proxy env var is present. Returns true when a dispatcher was registered.
 *
 * `deps` is injectable so unit tests can assert the gating decision without
 * actually instantiating the experimental agent or mutating global undici state.
 */
export function installEnvProxyDispatcher(
  deps: {
    env?: NodeJS.ProcessEnv;
    register?: () => void;
  } = {},
): boolean {
  const env = deps.env ?? process.env;
  if (!hasProxyEnv(env)) return false;
  const register =
    deps.register ?? (() => setGlobalDispatcher(new EnvHttpProxyAgent()));
  register();
  return true;
}

installEnvProxyDispatcher();
