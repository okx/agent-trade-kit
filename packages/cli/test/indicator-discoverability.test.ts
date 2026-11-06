/**
 * Tests for indicator --list flag discoverability in CLI registry.
 *
 * Verifies that the CLI registry usage and description for `<indicator> <instId>`
 * correctly surface the --list flag, so users know a series requires --list + --limit.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_INDICATOR_PARAMS } from "@agent-tradekit/core";
import { CLI_REGISTRY } from "../src/cli-registry.js";

function getIndicatorCommand() {
  const market = CLI_REGISTRY["market"];
  assert.ok(market, "market module not found in CLI_REGISTRY");
  const indicator = market.subgroups?.["indicator"];
  assert.ok(indicator, "indicator subgroup not found in CLI_REGISTRY['market']");
  const cmd = indicator.commands?.["<indicator> <instId>"];
  assert.ok(cmd, "'<indicator> <instId>' command not found in indicator subgroup");
  return cmd;
}

describe("indicator command discoverability - CLI registry", () => {
  it("usage contains [--list]", () => {
    const cmd = getIndicatorCommand();
    assert.ok(
      cmd.usage.includes("[--list]"),
      `Expected usage to include '[--list]'.\nGot: "${cmd.usage}"`,
    );
  });

  it("usage places [--list] before [--limit]", () => {
    const cmd = getIndicatorCommand();
    const listIdx = cmd.usage.indexOf("[--list]");
    const limitIdx = cmd.usage.indexOf("[--limit");
    assert.ok(listIdx !== -1, "usage must include [--list]");
    assert.ok(limitIdx !== -1, "usage must include [--limit]");
    assert.ok(
      listIdx < limitIdx,
      `Expected [--list] to appear before [--limit] in usage.\nGot: "${cmd.usage}"`,
    );
  });

  it("description mentions --list", () => {
    const cmd = getIndicatorCommand();
    assert.ok(
      cmd.description.includes("--list"),
      `Expected description to mention '--list'.\nGot: "${cmd.description}"`,
    );
  });

  it("description explains default behavior (returns latest value)", () => {
    const cmd = getIndicatorCommand();
    const desc = cmd.description.toLowerCase();
    const mentionsDefault = desc.includes("latest") || desc.includes("default");
    assert.ok(
      mentionsDefault,
      `Expected description to mention default behavior (\"latest\" or \"default\").\nGot: "${cmd.description}"`,
    );
  });
});

describe("indicator skill doc stays in sync with the params contract", () => {
  const skillPath = fileURLToPath(new URL("../../../skills/okx-cex-market/references/indicator-commands.md", import.meta.url));
  const lines = readFileSync(skillPath, "utf8").split("\n");

  it("every default in the 'Supported Indicators' table equals the code default (— means none)", () => {
    const row = /^\| \*\*[A-Za-z\- ]+\*\* \| `([a-z0-9-]+)`(?: \(or `boll`\))? \| (`[^`]*`|—) \|/;
    let checked = 0;
    for (const line of lines) {
      const m = row.exec(line);
      if (!m) continue;
      const [, name, cell] = m;
      const doc = cell === "—" ? undefined : cell!.replace(/`/g, "");
      const code = DEFAULT_INDICATOR_PARAMS[name!]?.join(",");
      assert.equal(doc, code, `${name}: skill default ${doc ?? "—"} vs code ${code ?? "none"}`);
      checked++;
    }
    assert.ok(checked > 70, `expected the full indicator table, parsed ${checked} rows`);
  });

  it("every indicator with a default is listed in the '--params contract' table with that default", () => {
    const start = lines.findIndex((l) => l.startsWith("### `--params` contract"));
    const end = lines.findIndex((l, i) => i > start && l.startsWith("Notes on the less obvious"));
    assert.ok(start >= 0 && end > start, "contract section not found");
    const section = lines.slice(start, end);
    for (const [name, defaults] of Object.entries(DEFAULT_INDICATOR_PARAMS)) {
      const row = section.find((l) => new RegExp(`\\| [^|]*\`${name}\`[^|]*\\| [^|]*\\| \`${defaults.join(",")}\` \\|`).test(l));
      assert.ok(row, `contract table has no row for ${name} with default ${defaults.join(",")}`);
    }
  });
});
