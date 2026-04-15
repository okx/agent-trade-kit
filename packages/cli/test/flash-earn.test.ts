import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdFlashEarnProjects } from "../src/commands/flash-earn.js";
import { setOutput, resetOutput } from "../src/formatter.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  process.exitCode = undefined;
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => {
  process.exitCode = undefined;
  resetOutput();
});

function projectsResult(data: Record<string, unknown>[]) {
  return {
    endpoint: "GET /api/v5/finance/flash-earn/projects",
    requestTime: new Date().toISOString(),
    data,
  };
}

function createRunner(
  data: Record<string, unknown>[],
  onCall?: (toolName: string, args: Record<string, unknown>) => void,
): ToolRunner {
  return (async (toolName: string, args: Record<string, unknown>) => {
    onCall?.(toolName, args);
    if (toolName === "earn_get_flash_earn_projects") return projectsResult(data);
    throw new Error(`Unexpected tool call: ${toolName}`);
  }) as ToolRunner;
}

const sampleProject = {
  id: "190",
  status: 0,
  canPurchase: true,
  beginTs: "1775203200000",
  endTs: "1775808000000",
  beginTime: "2026-04-01T00:00:00.000Z",
  endTime: "2026-04-08T00:00:00.000Z",
  rewards: [{ amt: "1000", ccy: "ETH" }],
};

/* ------------------------------------------------------------------ */
/*  cmdFlashEarnProjects                                                */
/* ------------------------------------------------------------------ */

describe("cmdFlashEarnProjects", () => {
  it("shows 'No flash earn projects' when data is empty", async () => {
    const runner = createRunner([]);
    await cmdFlashEarnProjects(runner, undefined, false);
    assert.ok(out.join("").includes("No flash earn projects"));
  });

  it("renders table when projects exist", async () => {
    const runner = createRunner([sampleProject]);
    await cmdFlashEarnProjects(runner, undefined, false);
    const output = out.join("");
    assert.ok(output.includes("190"));
  });

  it("outputs valid JSON when json=true", async () => {
    const runner = createRunner([sampleProject]);
    await cmdFlashEarnProjects(runner, undefined, true);
    const parsed = JSON.parse(out.join(""));
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, "190");
  });

  it("passes status as integer array to tool runner", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([], (_, args) => { captured = args; });
    await cmdFlashEarnProjects(runner, "0,100", false);
    assert.deepEqual(captured, { status: [0, 100] });
  });

  it("passes single status as integer array", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([], (_, args) => { captured = args; });
    await cmdFlashEarnProjects(runner, "100", false);
    assert.deepEqual(captured, { status: [100] });
  });

  it("omits status when not provided", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([], (_, args) => { captured = args; });
    await cmdFlashEarnProjects(runner, undefined, false);
    assert.deepEqual(captured, {});
  });

  it("outputs empty JSON array when no projects and json=true", async () => {
    const runner = createRunner([]);
    await cmdFlashEarnProjects(runner, undefined, true);
    const parsed = JSON.parse(out.join(""));
    assert.deepEqual(parsed, []);
  });

  it("trims whitespace around status values", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([], (_, args) => { captured = args; });
    await cmdFlashEarnProjects(runner, " 0, 100 ", false);
    assert.deepEqual(captured, { status: [0, 100] });
  });

  it("rejects unsupported status values", async () => {
    let called = false;
    const runner = createRunner([], () => { called = true; });
    await cmdFlashEarnProjects(runner, "foo", false);
    assert.equal(called, false);
    assert.ok(err.join("").includes('only supports 0'));
    assert.equal(process.exitCode, 1);
  });

  it("rejects empty status segments", async () => {
    let called = false;
    const runner = createRunner([], () => { called = true; });
    await cmdFlashEarnProjects(runner, "0,", false);
    assert.equal(called, false);
    assert.ok(err.join("").includes('comma-separated string'));
    assert.equal(process.exitCode, 1);
  });
});
