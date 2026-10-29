import { OkxApiError } from "../../utils/errors.js";

interface WriteResponse {
  endpoint: string;
  requestTime: string;
  data: unknown;
}

export interface RecurringWriteOptions {
  /**
   * The endpoint must return an item that carries the new strategy's algoId
   * (create). A success response without one is treated as a failure, because
   * the caller could not act on the strategy and a blind retry may create a duplicate.
   */
  requireAlgoId?: boolean;
}

function isFailedItem(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && "sCode" in item && (item as Record<string, unknown>)["sCode"] !== "0";
}

function hasAlgoId(item: unknown): boolean {
  if (item === null || typeof item !== "object") return false;
  const algoId = (item as Record<string, unknown>)["algoId"];
  return typeof algoId === "string" && algoId !== "";
}

/**
 * Normalise a Recurring Buy write response.
 * Items with sCode != "0" raise an OkxApiError. Empty or absent `data` is a
 * success: four endpoints (amend-time, amend-amount, amend-price-range,
 * add-investment) return no payload on success. Pass `requireAlgoId` for
 * endpoints that must return the new strategy id (create).
 */
export function normalizeRecurringWrite(
  response: WriteResponse,
  options: RecurringWriteOptions = {},
): Record<string, unknown> {
  const items = Array.isArray(response.data) ? response.data : [];
  const failed = items.filter(isFailedItem);
  if (failed.length > 0) {
    const message = failed.map((item) => `[${String(item["sCode"])}] ${String(item["sMsg"] ?? "Operation failed")}`).join("; ");
    throw new OkxApiError(message, { code: String(failed[0]["sCode"]), endpoint: response.endpoint });
  }
  if (options.requireAlgoId && !hasAlgoId(items[0])) {
    throw new OkxApiError("The server reported success but returned no algoId, so the strategy cannot be confirmed.", {
      endpoint: response.endpoint,
      suggestion: "Check `okx bot recurring orders` before retrying, to avoid creating a duplicate strategy.",
    });
  }
  return { endpoint: response.endpoint, requestTime: response.requestTime, data: response.data };
}
