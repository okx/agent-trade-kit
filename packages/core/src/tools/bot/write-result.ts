import { OkxApiError } from "../../utils/errors.js";

interface WriteResponse {
  endpoint: string;
  requestTime: string;
  data: unknown;
}

function isFailedItem(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && "sCode" in item && (item as Record<string, unknown>)["sCode"] !== "0";
}

/**
 * Normalise a Recurring Buy write response.
 * Items with sCode != "0" raise an OkxApiError. Empty or absent `data` is a
 * success: four endpoints (amend-time, amend-amount, amend-price-range,
 * add-investment) return no payload on success.
 */
export function normalizeRecurringWrite(response: WriteResponse): Record<string, unknown> {
  const items = Array.isArray(response.data) ? response.data : [];
  const failed = items.filter(isFailedItem);
  if (failed.length > 0) {
    const message = failed.map((item) => `[${String(item["sCode"])}] ${String(item["sMsg"] ?? "Operation failed")}`).join("; ");
    throw new OkxApiError(message, { code: String(failed[0]!["sCode"]), endpoint: response.endpoint });
  }
  return { endpoint: response.endpoint, requestTime: response.requestTime, data: response.data };
}
