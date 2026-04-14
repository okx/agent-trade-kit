import type { ToolSpec } from "../types.js";
import { asRecord, compactObject, normalizeResponse } from "../helpers.js";
import { privateRateLimit } from "../common.js";

const DEFAULT_STATUS = [0, 100];

export function formatTimestamp(ts: string): string {
  const d = new Date(Number(ts));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const sec = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${sec} UTC`;
}

export function registerFlashEarnTools(): ToolSpec[] {
  return [
    {
      name: "earn_get_flash_earn_projects",
      module: "earn.flash",
      description:
        "Get Flash Earn projects. Use this to browse upcoming or in-progress Flash Earn opportunities. " +
        "Do NOT use for purchase or redeem actions — Flash Earn is query-only in this module.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "integer" },
            description:
              "Status filter. 0=upcoming, 100=in-progress. Defaults to [0,100].",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const raw = args["status"];
        const statusArr: number[] =
          Array.isArray(raw) && raw.every((v) => typeof v === "number")
            ? raw
            : DEFAULT_STATUS;
        const params: Record<string, string> = { status: statusArr.join(",") };
        const response = await context.client.privateGet(
          "/api/v5/finance/flash-earn/projects",
          compactObject(params),
          privateRateLimit("earn_get_flash_earn_projects", 6),
        );
        const data = response.data as Record<string, unknown>[];
        const enriched = data.map((item) => ({
          ...item,
          ...(typeof item.beginTs === "string" && item.beginTs
            ? { beginTime: formatTimestamp(item.beginTs) } : {}),
          ...(typeof item.endTs === "string" && item.endTs
            ? { endTime: formatTimestamp(item.endTs) } : {}),
        }));
        return normalizeResponse({ ...response, data: enriched });
      },
    },
  ];
}
