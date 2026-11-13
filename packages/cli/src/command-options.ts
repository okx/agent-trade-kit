/**
 * Command-level option allow-lists for `okx bot recurring <action>` and
 * `okx bot smart-portfolio <action>`.
 *
 * parseCli otherwise validates against one shared option table, so an option that
 * belongs to another command (e.g. `bot recurring pause --amt 10`) is silently
 * accepted and ignored. For the two commands below an action only accepts the
 * options it really reads, plus the global ones; anything else fails with
 * "Unknown option" before any request is made.
 *
 * Every other command keeps the shared table (this is a partial, scoped fix, not a
 * CLI-wide one). This module is deliberately independent of cli-registry.ts so the
 * parser (a startup hot path) does not pull in the registry; the registry <-> table
 * sync is enforced by test/command-options.test.ts.
 *
 * Audit basis: the per-action reads in handleBotRecurringCommand /
 * handleBotSmartPortfolioCommand (index.ts) and the usage strings in cli-registry.ts.
 * No aliases were added: `--amount`/`--amt` stay only on the recurring actions that
 * read both (amend-amount, add-investment); `--aiBuilderCode` only on the create
 * actions whose usage documents it.
 */

/** Options that apply to every command (profile / mode / output / help). */
export const GLOBAL_OPTIONS: readonly string[] = [
  "profile",
  "demo",
  "live",
  "site",
  "json",
  "env",
  "verbose",
  "help",
  "version",
];

/**
 * Options only parsed for the strict commands above. Kept out of the shared
 * CLI_OPTIONS table so other commands keep rejecting them.
 */
export const STRICT_ONLY_OPTIONS = {
  addInvest: { type: "string" },
} as const;

const STRICT_COMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  // ── Recurring Buy ─────────────────────────────────────────────────────────
  "bot recurring create": [
    "stgyName", "recurringList", "period", "recurringDay", "recurringHour", "recurringTime", "timeZone",
    "amt", "investmentCcy", "tdMode", "algoClOrdId", "tradeQuoteCcy", "source", "recurringTimeType", "aiBuilderCode",
  ],
  "bot recurring orders": ["history", "algoId", "after", "before", "limit"],
  "bot recurring details": ["algoId"],
  "bot recurring sub-orders": ["algoId", "ordId", "after", "before", "limit"],
  "bot recurring pause": ["algoId"],
  "bot recurring restart": ["algoId"],
  "bot recurring stop": ["algoId"],
  "bot recurring amend-name": ["algoId", "stgyName"],
  "bot recurring amend-price-range": ["algoId", "recurringList"],
  "bot recurring amend-amount": ["algoId", "amount", "amt"],
  "bot recurring amend-time": [
    "algoId", "recurringTimeType", "period", "timeZone", "recurringDay", "recurringHour", "recurringTime",
  ],
  "bot recurring add-investment": ["algoId", "amount", "amt"],
  // ── Smart Portfolio ───────────────────────────────────────────────────────
  "bot smart-portfolio orders": ["history", "algoId", "instId", "state", "instType", "after", "before", "limit"],
  "bot smart-portfolio details": ["algoId"],
  "bot smart-portfolio create": [
    "stgyName", "investmentCcy", "initCapital", "portfolioList", "interval", "deltaRatio",
    "tradeQuoteCcy", "investType", "algoClOrdId", "aiBuilderCode",
  ],
  "bot smart-portfolio stop": ["algoId", "stopType"],
  "bot smart-portfolio amend-rebalance": ["algoId", "deltaRatio", "interval"],
  "bot smart-portfolio instant-rebalance": ["algoId"],
  "bot smart-portfolio recommend-zones": ["recommendId", "assetType"],
  "bot smart-portfolio zones-backtest": ["recommendId", "period"],
  "bot smart-portfolio manual-pause": ["algoId"],
  "bot smart-portfolio manual-resume": ["algoId"],
  "bot smart-portfolio add-investment": ["algoId", "addInvest", "tradeQuoteCcy"],
  "bot smart-portfolio edit-portfolio": ["algoId", "portfolioList", "addInvest", "tradeQuoteCcy"],
};

/** Commands (full three-word paths) that use a strict allow-list. */
export function strictCommandPaths(): string[] {
  return Object.keys(STRICT_COMMAND_OPTIONS);
}

/**
 * The allowed option names (business options + global ones) for a full command path
 * such as "bot smart-portfolio manual-pause", or undefined if the command is not strict.
 */
export function getStrictCommandOptions(command: string): ReadonlySet<string> | undefined {
  const own = Object.hasOwn(STRICT_COMMAND_OPTIONS, command) ? STRICT_COMMAND_OPTIONS[command] : undefined;
  return own ? new Set([...own, ...GLOBAL_OPTIONS]) : undefined;
}

/** Business options of a strict command, without the global ones (for sync tests). */
export function getStrictBusinessOptions(command: string): readonly string[] | undefined {
  return Object.hasOwn(STRICT_COMMAND_OPTIONS, command) ? STRICT_COMMAND_OPTIONS[command] : undefined;
}
