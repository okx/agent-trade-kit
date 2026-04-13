/**
 * okx list-tools [--json]
 *
 * Agent self-discovery command.  Serializes the full CLI registry into structured
 * JSON so AI agents can programmatically enumerate all available capabilities,
 * parameters, and tool names without parsing --help text.
 *
 * Output format:
 * {
 *   version: "1.x.x",
 *   totalTools: N,
 *   modules: [{
 *     name: "market",
 *     description: "...",
 *     commands: [{
 *       path: "okx market ticker",
 *       toolName: "market_get_ticker",
 *       description: "...",
 *       parameters: [{ name: "instId", type: "string", required: true }]
 *     }]
 *   }]
 * }
 */

import { allToolSpecs, MODULE_DESCRIPTIONS } from "@agent-tradekit/core";
import type { ToolSpec } from "@agent-tradekit/core";
import { CLI_REGISTRY } from "../cli-registry.js";
import type { CliCommandEntry, CliModuleEntry } from "../cli-registry.js";
import { resolveCommandDescription } from "../help-generator.js";
import { readCliVersion } from "./diagnose-utils.js";
import { output } from "../formatter.js";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface DiscoveryParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface DiscoveryCommand {
  /** Full CLI invocation path, e.g. "okx market ticker" */
  path: string;
  /** Backing ToolSpec name; null for management/composite commands */
  toolName: string | null;
  description: string;
  parameters: DiscoveryParameter[];
}

export interface DiscoveryModule {
  name: string;
  description: string;
  commands: DiscoveryCommand[];
}

export interface DiscoveryOutput {
  version: string;
  totalTools: number;
  modules: DiscoveryModule[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractParameters(toolName: string | null, specMap: Map<string, ToolSpec>): DiscoveryParameter[] {
  if (toolName == null) return [];
  const spec = specMap.get(toolName);
  if (!spec?.inputSchema) return [];

  const schema = spec.inputSchema as {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };

  if (!schema.properties) return [];

  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: prop.type ?? "string",
    required: required.has(name),
    description: prop.description,
  }));
}

function collectCommands(
  modulePath: string,
  mod: CliModuleEntry,
  specMap: Map<string, ToolSpec>,
  commands: DiscoveryCommand[],
): void {
  // Process direct commands
  for (const [cmdName, entry] of Object.entries(mod.commands ?? {})) {
    commands.push({
      path: `${modulePath} ${cmdName}`,
      toolName: entry.toolName,
      description: resolveCommandDescription(entry, specMap, ""),
      parameters: extractParameters(entry.toolName, specMap),
    });
  }

  // Recurse into subgroups
  for (const [sgName, sg] of Object.entries(mod.subgroups ?? {})) {
    collectCommands(`${modulePath} ${sgName}`, sg, specMap, commands);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the discovery output object (used by tests and cmdListTools).
 */
export function getDiscoveryOutput(): DiscoveryOutput {
  const specs = allToolSpecs();
  const specMap = new Map(specs.map((s) => [s.name, s]));
  const version = readCliVersion();

  const modules: DiscoveryModule[] = [];

  for (const [moduleKey, moduleEntry] of Object.entries(CLI_REGISTRY)) {
    const commands: DiscoveryCommand[] = [];
    collectCommands(`okx ${moduleKey}`, moduleEntry, specMap, commands);

    const description =
      moduleEntry.description ??
      (MODULE_DESCRIPTIONS as Partial<Record<string, string>>)[moduleKey] ??
      moduleKey;

    modules.push({
      name: moduleKey,
      description,
      commands,
    });
  }

  const totalTools = modules.reduce(
    (sum, m) => sum + m.commands.filter((c) => c.toolName !== null).length,
    0,
  );

  return { version, totalTools, modules };
}

/**
 * `okx list-tools [--json]`
 *
 * Prints structured JSON listing all CLI modules, commands, and parameters.
 * Designed for AI agent consumption — use `okx list-tools --json` to get
 * machine-readable capability discovery.
 */
export function cmdListTools(json: boolean): void {
  const data = getDiscoveryOutput();

  if (json) {
    output(JSON.stringify(data, null, 2) + "\n");
    return;
  }

  // Human-readable summary
  const lines: string[] = [
    "",
    `OKX CLI v${data.version} — ${data.totalTools} tool-backed commands across ${data.modules.length} modules`,
    "",
    "Modules:",
  ];

  for (const mod of data.modules) {
    const toolCmds = mod.commands.filter((c) => c.toolName !== null).length;
    if (toolCmds > 0) {
      lines.push(`  ${mod.name.padEnd(14)}${toolCmds} commands`);
    }
  }

  lines.push("", 'Use "okx list-tools --json" for machine-readable output.', "");
  output(lines.join("\n"));
}
