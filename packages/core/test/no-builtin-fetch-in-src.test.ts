/**
 * Architectural regression guard for the Node 26 proxy fix (ALGO-45373 / #211).
 *
 * Root cause of the original bug: production code called Node's *built-in*
 * global `fetch` while passing a `dispatcher` (ProxyAgent / Agent /
 * EnvHttpProxyAgent) created from the project's undici v6. On Node 26 the
 * built-in fetch is undici v8 and rejects / ignores the v6 dispatcher, so
 * proxied requests either throw `UND_ERR_INVALID_ARG` or silently bypass the
 * proxy. The fix is: every production HTTP call must use undici's `fetch`
 * (the same undici instance the dispatchers come from), never the global one.
 *
 * This test freezes that rule: no `.ts` file under any package's `src/` may
 * reference the bare global `fetch(` identifier. Callers must use the
 * undici-sourced fetch (imported as `undiciFetch`) or an injected wrapper
 * (`_fetchFn` / `_fetchImpl`). Without this guard a future `await fetch(url)`
 * added anywhere in src would reintroduce the bug and pass CI on every Node
 * version (a dispatcher-less built-in fetch does not crash — it just quietly
 * skips the proxy), so no existing test would catch it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// repo root = packages/core/test -> up three levels
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SRC_DIRS = ["packages/core/src", "packages/cli/src", "packages/mcp/src"]
  .map((d) => join(REPO_ROOT, d))
  .filter((d) => existsSync(d));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/**
 * Match a bare global `fetch(` call: the token `fetch` immediately followed by
 * `(`, where the char before `fetch` is NOT part of a longer identifier or a
 * property access. This intentionally does NOT match:
 *   - `undiciFetch(`  (preceding char is a letter → part of identifier)
 *   - `_fetchFn(` / `_fetchImpl(` (preceding `_`/letter → part of identifier)
 *   - `client.fetch(` (property access via `.`)
 *   - `import { fetch as undiciFetch }` (no `(` after `fetch`)
 */
const BARE_FETCH = /(^|[^A-Za-z0-9_.])fetch\s*\(/;

function stripped(line: string): string {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
  return line;
}

describe("architecture guard: no built-in global fetch in production src", () => {
  it("every src/*.ts uses undici fetch, never the bare global fetch", () => {
    assert.ok(SRC_DIRS.length > 0, "no src dirs found — check REPO_ROOT resolution");
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) {
      for (const file of walk(dir)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (BARE_FETCH.test(stripped(line))) {
            offenders.push(`${file.replace(REPO_ROOT, "")}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    assert.equal(
      offenders.length,
      0,
      "Bare built-in fetch( found in production src — must use undici fetch " +
        "(import { fetch as undiciFetch } from \"undici\") so the dispatcher " +
        "and fetch share one undici version (Node 26 compat, ALGO-45373):\n" +
        offenders.join("\n"),
    );
  });
});
