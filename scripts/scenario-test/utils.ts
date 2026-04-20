/**
 * Shared utilities for scenario tests.
 */

import type { OkxRestClient } from "../../packages/core/src/client/rest-client.js";
import type { OkxConfig } from "../../packages/core/src/config.js";
import type { ToolSpec } from "../../packages/core/src/tools/types.js";

export interface StepContext {
  client: OkxRestClient;
  config: OkxConfig;
  tools: ToolSpec[];
}

export type StepStatus = "PASS" | "FAIL" | "SKIP" | "WARN";

export interface StepResult {
  name: string;
  status: StepStatus;
  note: string;
  ms: number;
  data?: unknown;
}

export interface ScenarioResult {
  name: string;
  type: "stateless" | "stateful";
  status: "PASS" | "FAIL" | "SKIP";
  steps: StepResult[];
  ms: number;
}

const STATUS_ICONS: Record<StepStatus, string> = {
  PASS: "✅",
  FAIL: "❌",
  SKIP: "⏭️ ",
  WARN: "⚠️ ",
};

const SCENARIO_ICONS: Record<ScenarioResult["status"], string> = {
  PASS: "✅",
  FAIL: "❌",
  SKIP: "⏭️ ",
};

export function getTool(ctx: StepContext, name: string): ToolSpec {
  const tool = ctx.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

export async function runStep(
  ctx: StepContext,
  name: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<StepResult> {
  const tool = getTool(ctx, toolName);
  const t0 = Date.now();
  try {
    const data = await tool.handler(args, { client: ctx.client, config: ctx.config });
    const ms = Date.now() - t0;
    return { name, status: "PASS", note: "", ms, data };
  } catch (err) {
    const ms = Date.now() - t0;
    const note = err instanceof Error ? err.message.slice(0, 100) : String(err).slice(0, 100);
    return { name, status: "FAIL", note, ms };
  }
}

export function assert(
  result: StepResult,
  condition: boolean,
  failNote: string,
): StepResult {
  if (result.status !== "PASS") return result;
  if (!condition) {
    return { ...result, status: "FAIL", note: failNote };
  }
  return result;
}

export function assertField(
  result: StepResult,
  getter: (data: unknown) => unknown,
  fieldDesc: string,
): StepResult {
  if (result.status !== "PASS") return result;
  const val = getter(result.data);
  if (val === undefined || val === null || val === "") {
    return { ...result, status: "FAIL", note: `Missing field: ${fieldDesc}` };
  }
  return result;
}

export function printStep(step: StepResult, indent = "  "): void {
  const icon = STATUS_ICONS[step.status];
  const note = step.note ? `  (${step.note})` : "";
  console.log(`${indent}${icon} ${step.name.padEnd(45)} ${step.ms}ms${note}`);
}

export function printScenario(scenario: ScenarioResult): void {
  const icon = SCENARIO_ICONS[scenario.status];
  const typeTag = scenario.type === "stateless" ? "[read]" : "[write]";
  console.log(`\n${icon} ${typeTag} ${scenario.name}  (${scenario.ms}ms)`);
  for (const step of scenario.steps) {
    printStep(step);
  }
}

export function summarize(scenarios: ScenarioResult[]): void {
  const pass = scenarios.filter((s) => s.status === "PASS").length;
  const fail = scenarios.filter((s) => s.status === "FAIL").length;
  const skip = scenarios.filter((s) => s.status === "SKIP").length;
  console.log("\n" + "─".repeat(60));
  console.log(`Scenarios: ✅ ${pass} passed  ❌ ${fail} failed  ⏭️  ${skip} skipped`);
}

/** Pause between API calls to respect rate limits */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
