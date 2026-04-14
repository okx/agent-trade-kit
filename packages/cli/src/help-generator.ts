/**
 * Help tree generator — builds HelpTree from CLI_REGISTRY + ToolSpec descriptions.
 *
 * Description resolution order (first non-null wins):
 *   1. entry.description  (explicit override in CLI registry)
 *   2. toolSpec.description  (from @agent-tradekit/core ToolSpec registry)
 *   3. MODULE_DESCRIPTIONS[key]  (module-level fallback from constants)
 *   4. key  (raw key as last resort)
 *
 * The generated tree is memoized — computed once on first call and cached.
 */

import { allToolSpecs, MODULE_DESCRIPTIONS } from "@agent-tradekit/core";
import type { ToolSpec } from "@agent-tradekit/core";
import { CLI_REGISTRY } from "./cli-registry.js";
import type { CliCommandEntry, CliModuleEntry } from "./cli-registry.js";

// These types are re-exported so help.ts can import them from here.
export interface CommandInfo {
  /** Full usage line, e.g. "okx bot grid create --instId <id> ..." */
  usage: string;
  /** Short description of what the command does */
  description: string;
}

export interface GroupInfo {
  /** One-line description shown in parent overview */
  description: string;
  /** Optional direct usage line when the group has no sub-commands */
  usage?: string;
  /** Leaf commands within this group */
  commands?: Record<string, CommandInfo>;
  /** Nested sub-groups (e.g. bot → grid, spot → algo) */
  subgroups?: Record<string, GroupInfo>;
}

export type HelpTree = Record<string, GroupInfo>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSpecMap(): Map<string, ToolSpec> {
  return new Map(allToolSpecs().map((s) => [s.name, s]));
}

/**
 * Resolve a short CLI description for a command entry.
 * Falls back through: explicit registry description → ToolSpec first sentence → fallback string.
 * Exported so discovery.ts can share the same logic without duplication.
 */
export function resolveCommandDescription(
  entry: CliCommandEntry,
  specMap: Map<string, ToolSpec>,
  fallback = "(no description)",
): string {
  if (entry.description) return entry.description;
  if (entry.toolName != null) {
    const spec = specMap.get(entry.toolName);
    // ToolSpec descriptions are verbose (designed for MCP); take only the first sentence.
    // Use negative lookbehind to skip abbreviations (e.g., i.e., vs., etc., cf.)
    // then require ". " followed by uppercase letter (new sentence start).
    if (spec?.description) {
      const match = spec.description.match(
        /^(.*?(?<!\b(?:e\.g|i\.e|vs|etc|cf))\.)\s+(?=[A-Z])/,
      );
      return match ? match[1] : spec.description.replace(/\.\s*$/, "") + ".";
    }
  }
  return fallback;
}

function buildCommands(
  commands: Record<string, CliCommandEntry>,
  specMap: Map<string, ToolSpec>,
): Record<string, CommandInfo> {
  const result: Record<string, CommandInfo> = {};
  for (const [name, entry] of Object.entries(commands)) {
    result[name] = {
      usage: entry.usage,
      description: resolveCommandDescription(entry, specMap),
    };
  }
  return result;
}

function buildGroupInfo(
  key: string,
  mod: CliModuleEntry,
  specMap: Map<string, ToolSpec>,
): GroupInfo {
  const description =
    mod.description ??
    (MODULE_DESCRIPTIONS as Partial<Record<string, string>>)[key] ??
    key;

  return {
    description,
    usage: mod.usage,
    commands: mod.commands ? buildCommands(mod.commands, specMap) : undefined,
    subgroups: mod.subgroups
      ? buildSubgroups(mod.subgroups, specMap)
      : undefined,
  };
}

function buildSubgroups(
  subgroups: Record<string, CliModuleEntry>,
  specMap: Map<string, ToolSpec>,
): Record<string, GroupInfo> {
  const result: Record<string, GroupInfo> = {};
  for (const [name, entry] of Object.entries(subgroups)) {
    result[name] = buildGroupInfo(name, entry, specMap);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _cached: HelpTree | null = null;

/**
 * Build (and cache) the CLI help tree from the declarative CLI registry and
 * ToolSpec descriptions.  Call this instead of the static HELP_TREE constant.
 */
export function generateHelpTree(): HelpTree {
  if (_cached) return _cached;

  const specMap = buildSpecMap();
  const tree: HelpTree = {};

  for (const [key, mod] of Object.entries(CLI_REGISTRY)) {
    tree[key] = buildGroupInfo(key, mod, specMap);
  }

  _cached = tree;
  return tree;
}

/** Reset the memoization cache (useful in tests). */
export function resetHelpTreeCache(): void {
  _cached = null;
}
