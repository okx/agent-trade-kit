/**
 * Architectural regression guard for the Node 26 proxy fix (#211).
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
 * reference the built-in global fetch — neither the bare `fetch(` identifier
 * nor an explicit `globalThis.fetch(` / `global.fetch(`. Callers must use the
 * undici-sourced fetch (imported as `undiciFetch`) or an injected wrapper
 * (`_fetchFn` / `_fetchImpl`). Without this guard a future `await fetch(url)`
 * (or `globalThis.fetch(url)`) added anywhere in src would reintroduce the bug
 * and pass CI on every Node version (a dispatcher-less built-in fetch does not
 * crash — it just quietly skips the proxy), so no existing test would catch it.
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
 * Bare global `fetch(` call: the token `fetch` immediately followed by `(`,
 * where the char before `fetch` is NOT part of a longer identifier or a
 * property access. Does NOT match `undiciFetch(`, `_fetchFn(`, `_fetchImpl(`,
 * `client.fetch(`, or `import { fetch as undiciFetch }` (no `(` after `fetch`).
 */
const BARE_FETCH = /(^|[^A-Za-z0-9_.])fetch\s*\(/;
/**
 * Explicit global-object fetch call: `globalThis.fetch(` / `global.fetch(`.
 * BARE_FETCH deliberately excludes anything preceded by `.` (to allow
 * `client.fetch(`), which would otherwise let these built-in-fetch spellings
 * slip through — they reintroduce the exact bug this guard prevents.
 */
const GLOBAL_FETCH = /\bglobal(?:This)?\s*\.\s*fetch\s*\(/;

function isOffending(codeLine: string): boolean {
  return BARE_FETCH.test(codeLine) || GLOBAL_FETCH.test(codeLine);
}

function stripped(line: string): string {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
  return line;
}

describe("architecture guard: no built-in global fetch in production src", () => {
  it("the matcher flags built-in fetch spellings but not the sanctioned ones", () => {
    // Positive — must be caught (built-in fetch, reintroduces the bug):
    for (const s of ["await fetch(url)", "return fetch(u)", "globalThis.fetch(u)", "global.fetch(u)", "  globalThis . fetch (u)"]) {
      assert.ok(isOffending(s), `should flag: ${s}`);
    }
    // Negative — must NOT be caught (sanctioned indirections / non-calls):
    for (const s of [
      "await undiciFetch(url)",
      "this._fetchFn(url)",
      "await _fetchImpl(url)",
      "client.fetch(url)",
      'import { fetch as undiciFetch } from "undici";',
      "type F = typeof globalThis.fetch;", // a type ref, not a call
    ]) {
      assert.ok(!isOffending(s), `should NOT flag: ${s}`);
    }
  });

  it("every src/*.ts uses undici fetch, never the built-in global fetch", () => {
    assert.ok(SRC_DIRS.length > 0, "no src dirs found — check REPO_ROOT resolution");
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) {
      for (const file of walk(dir)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (isOffending(stripped(line))) {
            offenders.push(`${file.replace(REPO_ROOT, "")}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    assert.equal(
      offenders.length,
      0,
      "Built-in global fetch found in production src — must use undici fetch " +
        "(import { fetch as undiciFetch } from \"undici\") so the dispatcher " +
        "and fetch share one undici version (Node 26 compat):\n" +
        offenders.join("\n"),
    );
  });
});
