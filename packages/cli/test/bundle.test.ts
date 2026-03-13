/**
 * Build output verification — ensures the published bundle won't fail at
 * runtime due to missing dependencies.
 *
 * Two checks:
 * 1. Packages listed in tsup `noExternal` must NOT appear as bare imports
 *    in the dist output (they should be inlined).
 * 2. Any remaining bare import must be declared in package.json `dependencies`
 *    or be a Node built-in module.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "../dist/index.js");
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

/** Extract bare-specifier imports from ESM bundle source. */
function extractExternalImports(source: string): string[] {
  const re = /\bimport\s[\s\S]*?\sfrom\s+["']([^./][^"']*)["']/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const spec = m[1];
    // normalise scoped packages: "@scope/pkg/foo" → "@scope/pkg"
    const name = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    if (!builtins.has(name)) seen.add(name);
  }
  return [...seen];
}

const noExternal = ["@agent-tradekit/core"];
const deps = Object.keys(pkg.dependencies ?? {});

describe("CLI bundle integrity", () => {
  const source = readFileSync(dist, "utf-8");
  const externalImports = extractExternalImports(source);

  it("noExternal packages should be inlined, not imported externally", () => {
    const leaked = externalImports.filter((imp) => noExternal.includes(imp));
    assert.deepStrictEqual(
      leaked,
      [],
      `These packages are in noExternal but still appear as external imports in dist/index.js — ` +
        `tsup did not bundle them: ${leaked.join(", ")}`,
    );
  });

  it("all external imports must be declared in dependencies", () => {
    const missing = externalImports.filter((imp) => !deps.includes(imp));
    assert.deepStrictEqual(
      missing,
      [],
      `These packages are imported in dist/index.js but missing from package.json dependencies: ${missing.join(", ")}`,
    );
  });
});
