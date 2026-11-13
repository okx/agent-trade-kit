import { ValidationError } from "../../utils/errors.js";
import {
  assertExpandable,
  compareDecimal,
  formatScaled,
  parseDecimal,
  sumDecimalsToScale,
  toPlainString,
  type ParsedDecimal,
} from "./decimal.js";

/**
 * Client-side validation for Smart Portfolio parameters. All numeric checks use
 * the exact decimal helpers (no Number), so binary floating-point error can
 * neither shrink a legal input nor let an illegal one through.
 */

const ZERO: ParsedDecimal = { neg: false, digits: "0", exp: 0 };
const ONE: ParsedDecimal = { neg: false, digits: "1", exp: 0 };
const MIN_DELTA_RATIO: ParsedDecimal = { neg: false, digits: "1", exp: -2 };

const PLAIN_DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Plain decimals are sent exactly as the user wrote them; other formats (e.g. 5e-1) are expanded. */
function toWireString(trimmed: string, d: ParsedDecimal): string {
  return PLAIN_DECIMAL_RE.test(trimmed) ? trimmed : toPlainString(d);
}

/**
 * Validate and truncate deltaRatio (toward zero, two decimals); the truncated
 * value must be in [0.01, 1). Negative values are rejected, never made absolute.
 */
export function normalizeDeltaRatio(raw: unknown): string {
  const value = parseDecimal(raw, "deltaRatio");
  // Truncation never moves a value across 0.01 or 1, so range-check the exact value.
  if (compareDecimal(value, MIN_DELTA_RATIO) < 0) {
    throw new ValidationError(
      `deltaRatio too small: ${String(raw).trim()} truncates below 0.01, minimum is 0.01`,
      `Use a deltaRatio >= 0.01 (e.g. "0.05" for 5%)`,
    );
  }
  if (compareDecimal(value, ONE) >= 0) {
    throw new ValidationError(
      `deltaRatio too large: ${String(raw).trim()} must be < 1`,
      `Use a deltaRatio < 1 (e.g. "0.05" for 5%)`,
    );
  }
  // value is in [0.01, 1): leading fractional zeros = -(digits + exp), at most one.
  const fraction = ("0".repeat(-(value.digits.length + value.exp)) + value.digits).slice(0, 2).padEnd(2, "0");
  return `0.${fraction}`;
}

export interface PortfolioItem {
  ccy: string;
  ratio: string;
}

/** Parse the portfolioList JSON string accepted by the create / edit tools. */
export function parsePortfolioListJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError(
      `portfolioList is not valid JSON: ${raw.slice(0, 200)}`,
      `Provide portfolioList as a JSON array, e.g. [{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]`,
    );
  }
}

function readItem(item: unknown): { ccy: string; ratio: string; weight: ParsedDecimal } {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new ValidationError("Each portfolioList item must be an object with ccy and ratio");
  }
  const rec = item as Record<string, unknown>;
  const rawCcy = rec["ccy"];
  if (rawCcy !== undefined && rawCcy !== null && typeof rawCcy !== "string") {
    throw new ValidationError("Each portfolioList item ccy must be a string");
  }
  const ccy = (rawCcy ?? "").toString().trim().toUpperCase();
  if (!ccy) throw new ValidationError("Each portfolioList item must have a non-empty ccy");

  const rawRatio = rec["ratio"];
  if (rawRatio !== undefined && rawRatio !== null && typeof rawRatio !== "string" && typeof rawRatio !== "number") {
    throw new ValidationError(`portfolioList ratio for ${ccy} must be a decimal string`);
  }
  const ratioText = (rawRatio ?? "").toString().trim();
  if (!ratioText) throw new ValidationError("Each portfolioList item must have a non-empty ratio");

  let weight: ParsedDecimal;
  try {
    weight = parseDecimal(ratioText, "portfolioList ratio");
  } catch (err) {
    if (err instanceof ValidationError && /too long|exponent/.test(err.message)) throw err;
    throw new ValidationError(`portfolioList ratio "${ratioText.slice(0, 64)}" is not a valid number`);
  }
  if (compareDecimal(weight, ZERO) <= 0) {
    throw new ValidationError(`portfolioList ratio for ${ccy} must be greater than 0, got "${ratioText}"`);
  }
  if (compareDecimal(weight, ONE) > 0) {
    throw new ValidationError(`portfolioList ratio for ${ccy} must not exceed 1, got "${ratioText}"`);
  }
  assertExpandable(weight, `portfolioList ratio "${ratioText.slice(0, 64)}"`);
  return { ccy, ratio: toWireString(ratioText, weight), weight };
}

/**
 * Validate and normalize portfolioList: 2–10 objects, trimmed/upper-cased unique
 * ccy, every weight a positive exact decimal and the weights summing to exactly 1.
 * No tolerance, no auto-normalisation of the weights.
 */
export function validateAndNormalizePortfolioList(raw: unknown): PortfolioItem[] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new ValidationError(
      `portfolioList must have at least 2 items, got ${Array.isArray(raw) ? raw.length : "non-array"}`,
    );
  }
  if (raw.length > 10) {
    throw new ValidationError(
      `portfolioList must have at most 10 items, got ${raw.length}`,
      `Provide 2–10 unique assets in portfolioList`,
    );
  }

  const items = raw.map(readItem);

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.ccy)) {
      throw new ValidationError(`Duplicate CCY in portfolioList after normalization: ${item.ccy}`);
    }
    seen.add(item.ccy);
  }

  const { value, scale } = sumDecimalsToScale(items.map((item) => item.weight));
  if (value !== 10n ** BigInt(scale)) {
    throw new ValidationError(
      `portfolioList ratio values must sum to 1.0, got ${formatScaled(value, scale)}`,
      `Ensure the ratio values in portfolioList add up to exactly 1.0`,
    );
  }

  return items.map(({ ccy, ratio }) => ({ ccy, ratio }));
}

/**
 * addInvest. "required" (add-investment): must be a positive amount.
 * "optional" (edit-portfolio): missing / null / blank / zero means "no top-up"
 * and returns undefined; a positive amount is kept; invalid or negative is rejected.
 */
export function normalizeAddInvest(value: unknown, mode: "required" | "optional"): string | undefined {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new ValidationError(`Parameter "addInvest" must be a decimal string.`);
  }
  const text = (value ?? "").trim();
  if (!text) {
    if (mode === "optional") return undefined;
    throw new ValidationError(`Missing required parameter "addInvest".`);
  }
  const amount = parseDecimal(text, "addInvest");
  const sign = compareDecimal(amount, ZERO);
  if (sign < 0) {
    throw new ValidationError(`addInvest must not be negative, got: ${text}`);
  }
  if (sign === 0) {
    if (mode === "optional") return undefined;
    throw new ValidationError(`addInvest must be greater than 0, got: ${text}`);
  }
  try {
    return toWireString(text, amount);
  } catch {
    throw new ValidationError(`addInvest is outside the supported size, got: ${text.slice(0, 64)}`);
  }
}

/**
 * tradeQuoteCcy for add-investment / edit-portfolio. MCP-side normalisation only:
 * trim, keep case, treat missing / null / blank as "omit" so the backend resolves
 * the strategy's settlement currency. A non-empty value is sent for the backend
 * to match exactly (a mismatch is rejected there with 51000).
 */
export function normalizeTradeQuoteCcy(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`Parameter "tradeQuoteCcy" must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
