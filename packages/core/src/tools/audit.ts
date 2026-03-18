// Audit log tools (local, no API calls).
// Reads the local trade audit log file written by TradeLogger so users can review past actions.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ToolSpec } from "./types.js";
import { asRecord, readNumber, readString } from "./helpers.js";
import type { LogEntry } from "../utils/logger.js";

const DEFAULT_LOG_DIR = path.join(os.homedir(), ".okx", "logs");

function getLogPaths(logDir: string, days = 7): string[] {
  const paths: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    paths.push(path.join(logDir, `trade-${yyyy}-${mm}-${dd}.log`));
  }
  return paths;
}

function readEntries(logDir: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const filePath of getLogPaths(logDir)) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as LogEntry);
      } catch {
        // skip malformed lines
      }
    }
  }
  return entries;
}

export function registerAuditTools(): ToolSpec[] {
  return [
    {
      name: "trade_get_history",
      module: "account",
      description:
        "Query local audit log of tool calls made through this MCP server. " +
        "Returns recent operations with timestamps, duration, params, and results. " +
        "Use to review what trades or queries were executed in this session or past sessions.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max results (default 20)",
          },
          tool: {
            type: "string",
            description: "e.g. swap_place_order",
          },
          level: {
            type: "string",
            enum: ["INFO", "WARN", "ERROR", "DEBUG"],
          },
          since: {
            type: "string",
            description: "ISO 8601 timestamp lower bound",
          },
        },
      },
      handler: async (rawArgs) => {
        const args = asRecord(rawArgs);
        const limit = Math.min(readNumber(args, "limit") ?? 20, 100);
        const toolFilter = readString(args, "tool");
        const levelFilter = readString(args, "level")?.toUpperCase();
        const since = readString(args, "since");
        const sinceTime = since ? new Date(since).getTime() : undefined;

        let entries = readEntries(DEFAULT_LOG_DIR);

        if (toolFilter) {
          entries = entries.filter((e) => e.tool === toolFilter);
        }
        if (levelFilter) {
          entries = entries.filter((e) => e.level === levelFilter);
        }
        if (sinceTime !== undefined) {
          entries = entries.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
        }

        // most recent first
        entries.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        entries = entries.slice(0, limit);

        return { entries, total: entries.length };
      },
    },
  ];
}
