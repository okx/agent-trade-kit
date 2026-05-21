// Side-effect module: registers EnvHttpProxyAgent as the global undici
// dispatcher so that HTTPS_PROXY / HTTP_PROXY / NO_PROXY env vars are
// honored by all undici fetch calls (Node's built-in fetch is undici-backed).
//
// Import order matters: this must be imported before any fetch calls occur.
// Per-request `dispatcher` options always override the global dispatcher,
// so existing explicit-proxy users (e.g. config.proxyUrl → ProxyAgent) are unaffected.
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new EnvHttpProxyAgent());
