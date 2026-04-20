import type { ToolRunner } from "@agent-tradekit/core";
import { errorLine, extractData, outputLine, printJson, printTable } from "../formatter.js";

const VALID_STATUS = new Set(["0", "100"]);

function normalizeStatus(status: string | undefined): number[] | undefined {
  if (status === undefined) return undefined;

  const value = status.trim();
  if (!value) {
    errorLine('Error: parameter "status" cannot be empty.');
    errorLine("Hint: use --status 0, --status 100, or --status 0,100.");
    process.exitCode = 1;
    return undefined;
  }

  const parts = value.split(",");
  if (parts.some((part) => part.trim() === "")) {
    errorLine('Error: parameter "status" must be a comma-separated string containing 0 and/or 100.');
    errorLine("Hint: use --status 0, --status 100, or --status 0,100.");
    process.exitCode = 1;
    return undefined;
  }

  const normalized = parts.map((part) => part.trim());
  if (!normalized.every((part) => VALID_STATUS.has(part))) {
    errorLine('Error: parameter "status" only supports 0 (upcoming) and 100 (in-progress).');
    errorLine("Hint: use --status 0, --status 100, or --status 0,100.");
    process.exitCode = 1;
    return undefined;
  }

  return [...new Set(normalized)].map(Number);
}

export async function cmdFlashEarnProjects(
  run: ToolRunner,
  status: string | undefined,
  json: boolean,
): Promise<void> {
  const statusArr = normalizeStatus(status);
  if (status !== undefined && statusArr === undefined) return;
  const data = extractData(await run(
    "earn_get_flash_earn_projects",
    statusArr ? { status: statusArr } : {},
  ));

  if (json) { printJson(data); return; }
  if (!data.length) { outputLine("No flash earn projects"); return; }

  printTable(data.map((r) => ({
    id: r["id"],
    status: r["status"],
    canPurchase: r["canPurchase"],
    beginTime: r["beginTime"] ?? r["beginTs"],
    endTime: r["endTime"] ?? r["endTs"],
    rewards: JSON.stringify(r["rewards"]),
  })));
}
