import { EOL } from "node:os";
import { configFilePath } from "@agent-tradekit/core";
import { output, errorLine } from "./formatter.js";
import { generateHelpTree } from "./help-generator.js";
import type { CommandInfo, GroupInfo, HelpTree } from "./help-generator.js";

// Re-export types so callers that previously imported from help.ts still work.
export type { CommandInfo, GroupInfo, HelpTree };

// ---------------------------------------------------------------------------
// Help data — auto-generated from CLI_REGISTRY + ToolSpec descriptions.
// The static HELP_TREE constant has been replaced by generateHelpTree() which
// reads packages/cli/src/cli-registry.ts and auto-fills descriptions from core
// ToolSpec registry.  Drift is prevented by packages/cli/test/drift.test.ts.
// ---------------------------------------------------------------------------

const HELP_TREE: HelpTree = generateHelpTree();

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** Render the global overview (no path arguments). */
function printGlobalHelp(): void {
  const lines: string[] = [
    "",
    `Usage: okx [--profile <name>] [--demo | --live] [--json] <module> <action> [args...]`,
    "",
    "Global Options:",
    `  --profile <name>   Use a named profile from ${configFilePath()}`,
    "  --demo             Use simulated trading (demo) mode",
    "  --live             Force live trading mode (overrides profile demo=true; mutually exclusive with --demo)",
    "  --json             Output raw JSON",
    "  --env              With --json, wrap output as {env, profile, data}",
    "  --verbose          Show detailed network request/response info (stderr)",
    "  --version, -v      Show version",
    "  --help             Show this help",
    "",
    "Modules:",
  ];

  const colWidth = 12;
  for (const [name, group] of Object.entries(HELP_TREE)) {
    lines.push(`  ${name.padEnd(colWidth)}${group.description}`);
  }

  lines.push("", 'Run "okx <module> --help" for module details.', "");
  output(lines.join(EOL));
}

/** Render pure-subgroup module body (e.g. bot). */
function printSubgroupOnlyModule(lines: string[], moduleName: string, group: GroupInfo): void {
  const subgroupNames = Object.keys(group.subgroups!);
  const colWidth = Math.max(...subgroupNames.map((n) => n.length)) + 4;
  lines.push(`Usage: okx ${moduleName} <strategy> <action> [args...]`);
  lines.push("", `${group.description}.`, "");
  lines.push("Strategies:");
  for (const [sgName, sg] of Object.entries(group.subgroups!)) {
    lines.push(`  ${sgName.padEnd(colWidth)}${sg.description}`);
  }
  lines.push("", `Run "okx ${moduleName} <strategy> --help" for details.`);
}

/** Render mixed module body (direct commands + subgroups, e.g. spot, swap). */
function printMixedModule(lines: string[], moduleName: string, group: GroupInfo): void {
  lines.push(`Usage: okx ${moduleName} <action> [args...]`);
  lines.push("", `${group.description}.`, "", "Commands:");
  printCommandList(lines, group.commands!);
  lines.push("", "Subgroups:");
  const subgroupEntries = Object.entries(group.subgroups!);
  const colWidth = Math.max(...subgroupEntries.map(([n]) => n.length)) + 4;
  for (const [sgName, sg] of subgroupEntries) {
    lines.push(`  ${sgName.padEnd(colWidth)}${sg.description}`);
  }
  lines.push("", `Run "okx ${moduleName} <subgroup> --help" for subgroup details.`);
}

/** Render commands-only module body (e.g. market, account). */
function printCommandsOnlyModule(lines: string[], moduleName: string, group: GroupInfo): void {
  lines.push(`Usage: okx ${moduleName} <action> [args...]`);
  lines.push("", `${group.description}.`, "", "Commands:");
  printCommandList(lines, group.commands!);
}

/** Render custom-usage module body (e.g. setup). */
function printUsageModule(lines: string[], group: GroupInfo): void {
  lines.push(`Usage: ${group.usage}`);
  lines.push("", `${group.description}.`);
  if (group.commands) {
    lines.push("");
    for (const cmd of Object.values(group.commands)) {
      lines.push(`  ${cmd.description}`);
      lines.push(`  Usage: ${cmd.usage}`);
    }
  }
}

/** Render module-level help (one path argument, e.g. "spot"). */
function printModuleHelp(moduleName: string): void {
  const group = HELP_TREE[moduleName];
  if (!group) {
    errorLine(`Unknown module: ${moduleName}`);
    process.exitCode = 1;
    return;
  }

  const hasSubgroups = group.subgroups && Object.keys(group.subgroups).length > 0;
  const hasCommands = group.commands && Object.keys(group.commands).length > 0;

  const lines: string[] = [""];

  if (hasSubgroups && !hasCommands) {
    printSubgroupOnlyModule(lines, moduleName, group);
  } else if (hasSubgroups && hasCommands) {
    printMixedModule(lines, moduleName, group);
  } else if (hasCommands) {
    printCommandsOnlyModule(lines, moduleName, group);
  } else if (group.usage) {
    printUsageModule(lines, group);
  }

  lines.push("");
  output(lines.join(EOL));
}

/** Render subgroup-level help (two path arguments, e.g. "bot", "grid"). */
function printSubgroupHelp(moduleName: string, subgroupName: string): void {
  const group = HELP_TREE[moduleName];
  if (!group) {
    errorLine(`Unknown module: ${moduleName}`);
    process.exitCode = 1;
    return;
  }
  const subgroup = group.subgroups?.[subgroupName];
  if (!subgroup) {
    errorLine(`Unknown subgroup: ${moduleName} ${subgroupName}`);
    process.exitCode = 1;
    return;
  }

  const lines: string[] = [
    "",
    `Usage: okx ${moduleName} ${subgroupName} <action> [args...]`,
    "",
    `${subgroup.description}.`,
    "",
    "Commands:",
  ];

  if (subgroup.commands) {
    printCommandList(lines, subgroup.commands);
  }

  lines.push("");
  output(lines.join(EOL));
}

/** Append a formatted command list to the lines array. */
function printCommandList(lines: string[], commands: Record<string, CommandInfo>): void {
  const names = Object.keys(commands);
  const colWidth = Math.max(...names.map((n) => n.length)) + 4;

  for (const [name, cmd] of Object.entries(commands)) {
    lines.push(`  ${name.padEnd(colWidth)}${cmd.description}`);
    // Indent usage lines to align with the description column
    const usageLines = cmd.usage.split("\n");
    lines.push(`  ${" ".repeat(colWidth)}Usage: ${usageLines[0]}`);
    for (const extra of usageLines.slice(1)) {
      lines.push(`  ${" ".repeat(colWidth)}       ${extra.trimStart()}`);
    }
    lines.push("");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Print help text to stdout.
 *
 * - `printHelp()` — global module overview
 * - `printHelp("market")` — module detail with all commands
 * - `printHelp("bot")` — module overview listing sub-strategies
 * - `printHelp("bot", "grid")` — subgroup detail with all commands
 * - `printHelp("spot", "algo")` — subgroup detail with all commands
 */
export function printHelp(...path: string[]): void {
  const [moduleName, subgroupName] = path;
  if (!moduleName) {
    printGlobalHelp();
  } else if (!subgroupName) {
    printModuleHelp(moduleName);
  } else {
    printSubgroupHelp(moduleName, subgroupName);
  }
}
