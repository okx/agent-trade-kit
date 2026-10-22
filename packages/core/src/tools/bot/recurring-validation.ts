import { ValidationError } from "../../utils/errors.js";
import { assertEnum, readString, requireString } from "../helpers.js";

/**
 * Client-side validation for Recurring Buy parameters. Only rules written in the
 * OpenAPI contract are enforced here; everything else (ratio sum, duplicate
 * coins, minimum investment, ...) is validated by the server.
 */

export const PERIODS = ["monthly", "weekly", "daily", "hourly"] as const;
export const TD_MODES = ["cash", "cross"] as const;
export const INVESTMENT_CCYS = ["USDT", "USDC"] as const;
export const SOURCES = ["1", "2", "3"] as const;
export const TIME_TYPES = ["1", "2"] as const;
export const RECURRING_HOURS = ["1", "4", "8", "12"] as const;
export const MAX_NAME_LENGTH = 40;

const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

type Args = Record<string, unknown>;

export type RecurringListMode = "create" | "priceRange";

export interface RecurringListItem {
  ccy: string;
  ratio?: string;
  minPx?: string;
  maxPx?: string;
}

/** Day-of-period range per period; daily/hourly have no day constraint. */
const DAY_RANGE: Partial<Record<(typeof PERIODS)[number], readonly [number, number]>> = {
  monthly: [1, 28],
  weekly: [1, 7],
};

/** Integer string within [min, max]. */
function checkInteger(value: string, key: string, min: number, max: number): void {
  if (!INTEGER_RE.test(value) || Number(value) < min || Number(value) > max) {
    throw new ValidationError(`Parameter "${key}" must be an integer in [${min}, ${max}], got: ${value}.`);
  }
}

/** Strategy name: required, at most 40 characters. */
export function requireStrategyName(args: Args): string {
  const name = requireString(args, "stgyName");
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Parameter "stgyName" must be at most ${MAX_NAME_LENGTH} characters, got ${name.length}.`);
  }
  return name;
}

/** timeZone is numeric in [-12, 14]; the server accepts decimals such as 5.5. */
export function checkTimeZone(value: string): void {
  const n = Number(value);
  if (!DECIMAL_RE.test(value) || n < -12 || n > 14) {
    throw new ValidationError(`Parameter "timeZone" must be a number in [-12, 14], got: ${value}.`);
  }
}

function parseJsonArray(raw: string, key: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      `${key} is not valid JSON: ${raw}`,
      `Provide ${key} as a JSON array, e.g. [{"ccy":"BTC","ratio":"0.2"},{"ccy":"ETH","ratio":"0.8"}]`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ValidationError(`${key} must be a non-empty JSON array.`);
  }
  return parsed;
}

/** JSON numbers are coerced to strings; null/undefined stay undefined. */
function readScalar(item: Record<string, unknown>, key: string): string | undefined {
  const value = item[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ValidationError(`recurringList item "${key}" must be a string or number.`);
  }
  return String(value);
}

function requireNumeric(value: string | undefined, key: string, allowEmpty: boolean): string {
  if (value === undefined) {
    throw new ValidationError(`Each recurringList item must have "${key}".`);
  }
  if (value === "" && allowEmpty) return value;
  if (!DECIMAL_RE.test(value)) {
    throw new ValidationError(`recurringList "${key}" must be a number${allowEmpty ? ' or "" (no limit)' : ""}, got: ${value}.`);
  }
  return value;
}

function optionalNumeric(value: string | undefined, key: string): string | undefined {
  return value === undefined ? undefined : requireNumeric(value, key, true);
}

function parseListItem(raw: unknown, mode: RecurringListMode): RecurringListItem {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Each recurringList item must be an object.");
  }
  const item = raw as Record<string, unknown>;
  const ccy = (readScalar(item, "ccy") ?? "").trim().toUpperCase();
  if (!ccy) throw new ValidationError('Each recurringList item must have a non-empty "ccy".');
  const minPx = readScalar(item, "minPx");
  const maxPx = readScalar(item, "maxPx");
  if (mode === "priceRange") {
    return { ccy, minPx: requireNumeric(minPx, "minPx", true), maxPx: requireNumeric(maxPx, "maxPx", true) };
  }
  const result: RecurringListItem = { ccy, ratio: requireNumeric(readScalar(item, "ratio"), "ratio", false) };
  const min = optionalNumeric(minPx, "minPx");
  const max = optionalNumeric(maxPx, "maxPx");
  if (min !== undefined) result.minPx = min;
  if (max !== undefined) result.maxPx = max;
  return result;
}

/**
 * Parse the `recurringList` JSON string.
 * - create: ccy + ratio required, minPx/maxPx optional.
 * - priceRange: ccy + minPx + maxPx required (""= no limit), no ratio.
 */
export function parseRecurringList(raw: string, mode: RecurringListMode): RecurringListItem[] {
  return parseJsonArray(raw, "recurringList").map((item) => parseListItem(item, mode));
}

/** Parse the comma-separated funding source flag into the array the API expects. */
export function parseSource(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new ValidationError('Parameter "source" must list at least one of: 1, 2, 3.');
  }
  for (const part of parts) assertEnum(part, "source", SOURCES);
  return parts;
}

export interface ScheduleOptions {
  /** Require recurringTime (and recurringDay for monthly/weekly). */
  requireTimeAndDay: boolean;
}

export interface Schedule {
  period: string;
  timeZone: string;
  recurringDay?: string;
  recurringHour?: string;
  recurringTime?: string;
}

function checkDay(period: string, day: string | undefined, required: boolean): void {
  const range = DAY_RANGE[period as (typeof PERIODS)[number]];
  if (!range) return; // daily/hourly: a supplied day is tolerated (contract amend-time example)
  if (day === undefined) {
    if (required) throw new ValidationError(`Parameter "recurringDay" is required when period is ${period}.`);
    return;
  }
  checkInteger(day, "recurringDay", range[0], range[1]);
}

function checkHour(period: string, hour: string | undefined): void {
  if (period !== "hourly") return;
  if (hour === undefined) {
    throw new ValidationError('Parameter "recurringHour" is required when period is hourly.');
  }
  assertEnum(hour, "recurringHour", RECURRING_HOURS);
}

function checkTime(time: string | undefined, required: boolean): void {
  if (time === undefined) {
    if (required) throw new ValidationError('Missing required parameter "recurringTime".');
    return;
  }
  checkInteger(time, "recurringTime", 0, 23);
}

/** Read and validate the schedule fields shared by place_order and amend_time. */
export function readSchedule(args: Args, options: ScheduleOptions): Schedule {
  const period = requireString(args, "period");
  assertEnum(period, "period", PERIODS);
  const timeZone = requireString(args, "timeZone");
  checkTimeZone(timeZone);
  const recurringDay = readString(args, "recurringDay");
  const recurringHour = readString(args, "recurringHour");
  const recurringTime = readString(args, "recurringTime");
  checkDay(period, recurringDay, options.requireTimeAndDay);
  checkHour(period, recurringHour);
  checkTime(recurringTime, options.requireTimeAndDay);
  return { period, timeZone, recurringDay, recurringHour, recurringTime };
}
