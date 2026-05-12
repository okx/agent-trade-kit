import { parseArgs } from "node:util";

export interface CliValues {
  profile?: string;
  demo?: boolean;
  json?: boolean;
  env?: boolean;
  help?: boolean;
  version?: boolean;
  client?: string;
  modules?: string;
  bar?: string;
  limit?: string;
  sz?: string;
  instId?: string;
  history?: boolean;
  ordId?: string;
  side?: string;
  ordType?: string;
  px?: string;
  posSide?: string;
  tdMode?: string;
  tgtCcy?: string;
  lever?: string;
  mgnMode?: string;
  tpTriggerPx?: string;
  tpOrdPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
  // Phase 1 algo order flags (issue #178)
  tpOrdKind?: string;
  tpTriggerPxType?: string;
  slTriggerPxType?: string;
  stpMode?: string;
  cxlOnClosePos?: boolean;
  // Phase 3a+c CLI power-user flags (issue #182, CLI-only no MCP/skill exposure)
  tpTriggerRatio?: string;
  slTriggerRatio?: string;
  closeFraction?: string;
  banAmend?: boolean;
  pxAmendType?: string;
  // Phase 3b CLI power-user flag (issue #183, CLI-only no MCP/skill exposure)
  tpLevel?: string[];
  // Phase 2 algo ordType flags (issue #181)
  orderPx?: string;
  advanceOrdType?: string;
  triggerPxType?: string;
  chaseType?: string;
  chaseVal?: string;
  maxChaseType?: string;
  maxChaseVal?: string;
  pxVar?: string;
  pxSpread?: string;
  szLimit?: string;
  pxLimit?: string;
  timeInterval?: string;
  algoId?: string;
  reduceOnly?: boolean;
  newSz?: string;
  newTpTriggerPx?: string;
  newTpOrdPx?: string;
  newSlTriggerPx?: string;
  newSlOrdPx?: string;
  callbackRatio?: string;
  callbackSpread?: string;
  activePx?: string;
  algoOrdType?: string;
  gridNum?: string;
  maxPx?: string;
  minPx?: string;
  runType?: string;
  quoteSz?: string;
  baseSz?: string;
  direction?: string;
  basePos?: boolean;
  tpRatio?: string;
  slRatio?: string;
  algoClOrdId?: string;
  stopType?: string;
  topUpAmt?: string;
  live?: boolean;
  instType?: string;
  instCategory?: string;
  quoteCcy?: string;
  archive?: boolean;
  valuation?: boolean;
  valuationCcy?: string;
  posMode?: string;
  ccy?: string;
  from?: string;
  to?: string;
  transferType?: string;
  subAcct?: string;
  amt?: string;
  autoCxl?: boolean;
  clOrdId?: string;
  newPx?: string;
  // dca bot (spot & contract)
  initOrdAmt?: string;
  safetyOrdAmt?: string;
  maxSafetyOrds?: string;
  pxSteps?: string;
  pxStepsMult?: string;
  volMult?: string;
  tpPct?: string;
  slPct?: string;
  slMode?: string;
  allowReinvest?: string;
  triggerStrategy?: string;
  triggerPx?: string;
  triggerCond?: string;
  thold?: string;
  timeframe?: string;
  timePeriod?: string;
  cycleId?: string;
  reserveFunds?: string;
  tradeQuoteCcy?: string;
  lang?: string;
  // option
  uly?: string;
  expTime?: string;
  // batch
  action?: string;
  orders?: string;
  // earn
  rate?: string;
  // flash-earn
  status?: string;
  reqId?: string;
  confirm?: boolean;
  // audit
  since?: string;
  tool?: string;
  // smartmoney
  authorId?: string;
  authorIds?: string;
  updateTime?: string;
  granularity?: string;
  lmtNum?: string;
  instCcy?: string;
  instCcyList?: string;
  topInstruments?: string;
  asOfTime?: string;
  // smartmoney pool filters — leaderboard (numeric thresholds, traders-by-filter endpoint)
  // Names deliberately distinct from signal-side `*Tier` enums to avoid cross-tool footguns.
  minPnl?: string;
  minWinRate?: string;
  maxDrawdown?: string;
  minAum?: string;
  // smartmoney pool filters — signal endpoints (enum tiers; sortBy declared elsewhere)
  pnlTier?: string;
  winRateTier?: string;
  maxDrawdownTier?: string;
  aumTier?: string;
  // upgrade
  beta?: boolean;
  check?: boolean;
  // config profile
  force?: boolean;
  // onchain-earn
  productId?: string;
  protocolType?: string;
  term?: string;
  tag?: string;
  allowEarlyRedeem?: boolean;
  state?: string;
  // dcd
  quoteId?: string;
  notionalCcy?: string;
  optType?: string;
  baseCcy?: string;
  beginId?: string;
  endId?: string;
  begin?: string;
  end?: string;
  minYield?: string;
  strikeNear?: string;
  termDays?: string;
  minTermDays?: string;
  maxTermDays?: string;
  expDate?: string;
  minAnnualizedYield?: string;
  // indicator
  params?: string;
  list?: boolean;
  "backtest-time"?: string;
  // pair-spread
  window?: string;
  // market candle time range
  after?: string;
  before?: string;
  // news
  coins?: string;
  sentiment?: string;
  importance?: string;
  platform?: string;
  keyword?: string;
  "detail-lvl"?: string;
  period?: string;
  points?: string;
  "sort-by"?: string;
  region?: string;
  // skill marketplace
  categories?: string;
  dir?: string;
  page?: string;
  format?: string;
  // auth
  site?: string;
  manual?: boolean;
  // event contract
  underlying?: string;
  seriesId?: string;
  eventId?: string;
  outcome?: string;
  // market-filter / oi-change-filter
  sortBy?: string;
  sortOrder?: string;
  minLast?: string;
  maxLast?: string;
  minChg24hPct?: string;
  maxChg24hPct?: string;
  minMarketCapUsd?: string;
  maxMarketCapUsd?: string;
  minVolUsd24h?: string;
  maxVolUsd24h?: string;
  minFundingRate?: string;
  maxFundingRate?: string;
  minOiUsd?: string;
  maxOiUsd?: string;
  instFamily?: string;
  ctType?: string;
  settleCcy?: string;
  ts?: string;
  minAbsOiDeltaPct?: string;
  // diagnostics (diagnose-specific flags)
  verbose?: boolean;
  mcp?: boolean;   // diagnose --mcp: run MCP server checks only
  cli?: boolean;   // diagnose --cli: run CLI/general checks only (explicit alias for default)
  all?: boolean;   // diagnose --all: run CLI checks then MCP checks
  output?: string; // diagnose --output: save diagnostic report to file
}

export const CLI_OPTIONS = {
  profile: { type: "string" },
  demo: { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  env: { type: "boolean", default: false },
  help: { type: "boolean", default: false },
  version: { type: "boolean", short: "v", default: false },
  // setup command
  client: { type: "string" },
  modules: { type: "string" },
  // market candles
  bar: { type: "string" },
  limit: { type: "string" },
  sz: { type: "string" },
  after: { type: "string" },
  before: { type: "string" },
  // orders
  instId: { type: "string" },
  history: { type: "boolean", default: false },
  ordId: { type: "string" },
  // trade
  side: { type: "string" },
  ordType: { type: "string" },
  px: { type: "string" },
  posSide: { type: "string" },
  tdMode: { type: "string" },
  tgtCcy: { type: "string" },
  // leverage
  lever: { type: "string" },
  mgnMode: { type: "string" },
  // algo orders
  tpTriggerPx: { type: "string" },
  tpOrdPx: { type: "string" },
  slTriggerPx: { type: "string" },
  slOrdPx: { type: "string" },
  // Phase 1 algo order flags (issue #178)
  tpOrdKind: { type: "string" },
  tpTriggerPxType: { type: "string" },
  slTriggerPxType: { type: "string" },
  stpMode: { type: "string" },
  cxlOnClosePos: { type: "boolean", default: false },
  // Phase 3a+c CLI power-user flags (issue #182, CLI-only no MCP/skill exposure)
  tpTriggerRatio: { type: "string" },
  slTriggerRatio: { type: "string" },
  closeFraction: { type: "string" },
  banAmend: { type: "boolean", default: false },
  pxAmendType: { type: "string" },
  // Phase 3b CLI power-user flag (issue #183, CLI-only no MCP/skill exposure)
  tpLevel: { type: "string", multiple: true },
  // Phase 2 algo ordType flags (issue #181)
  orderPx: { type: "string" },
  advanceOrdType: { type: "string" },
  triggerPxType: { type: "string" },
  chaseType: { type: "string" },
  chaseVal: { type: "string" },
  maxChaseType: { type: "string" },
  maxChaseVal: { type: "string" },
  pxVar: { type: "string" },
  pxSpread: { type: "string" },
  szLimit: { type: "string" },
  pxLimit: { type: "string" },
  timeInterval: { type: "string" },
  algoId: { type: "string" },
  reduceOnly: { type: "boolean", default: false },
  // algo amend
  newSz: { type: "string" },
  newTpTriggerPx: { type: "string" },
  newTpOrdPx: { type: "string" },
  newSlTriggerPx: { type: "string" },
  newSlOrdPx: { type: "string" },
  // trailing stop
  callbackRatio: { type: "string" },
  callbackSpread: { type: "string" },
  activePx: { type: "string" },
  // grid bot
  algoOrdType: { type: "string" },
  gridNum: { type: "string" },
  maxPx: { type: "string" },
  minPx: { type: "string" },
  runType: { type: "string" },
  quoteSz: { type: "string" },
  baseSz: { type: "string" },
  direction: { type: "string" },
  basePos: { type: "boolean", default: true },
  tpRatio: { type: "string" },
  slRatio: { type: "string" },
  algoClOrdId: { type: "string" },
  stopType: { type: "string" },
  topUpAmt: { type: "string" },
  live: { type: "boolean", default: false },
  // market extras
  instType: { type: "string" },
  instCategory: { type: "string" },
  quoteCcy: { type: "string" },
  // account extras
  archive: { type: "boolean", default: false },
  valuation: { type: "boolean", default: false },
  valuationCcy: { type: "string" },
  posMode: { type: "string" },
  ccy: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  transferType: { type: "string" },
  subAcct: { type: "string" },
  amt: { type: "string" },
  // swap/order extras
  autoCxl: { type: "boolean", default: false },
  clOrdId: { type: "string" },
  newPx: { type: "string" },
  // dca bot (spot & contract)
  initOrdAmt: { type: "string" },
  safetyOrdAmt: { type: "string" },
  maxSafetyOrds: { type: "string" },
  pxSteps: { type: "string" },
  pxStepsMult: { type: "string" },
  volMult: { type: "string" },
  tpPct: { type: "string" },
  slPct: { type: "string" },
  slMode: { type: "string" },
  allowReinvest: { type: "string" },
  triggerStrategy: { type: "string" },
  triggerPx: { type: "string" },
  triggerCond: { type: "string" },
  thold: { type: "string" },
  timeframe: { type: "string" },
  timePeriod: { type: "string" },
  cycleId: { type: "string" },
  reserveFunds: { type: "string" },
  tradeQuoteCcy: { type: "string" },
  // i18n
  lang: { type: "string" },
  // option
  uly: { type: "string" },
  expTime: { type: "string" },
  // batch
  action: { type: "string" },
  orders: { type: "string" },
  // earn
  rate: { type: "string" },
  // flash-earn
  status: { type: "string" },
  reqId: { type: "string" },
  confirm: { type: "boolean", default: false },
  // audit
  since: { type: "string" },
  tool: { type: "string" },
  // smartmoney
  authorId: { type: "string" },
  authorIds: { type: "string" },
  updateTime: { type: "string" },
  granularity: { type: "string" },
  lmtNum: { type: "string" },
  instCcy: { type: "string" },
  instCcyList: { type: "string" },
  topInstruments: { type: "string" },
  asOfTime: { type: "string" },
  // smartmoney pool filters — leaderboard (numeric thresholds)
  minPnl: { type: "string" },
  minWinRate: { type: "string" },
  maxDrawdown: { type: "string" },
  minAum: { type: "string" },
  // smartmoney pool filters — signal endpoints (enum tiers)
  pnlTier: { type: "string" },
  winRateTier: { type: "string" },
  maxDrawdownTier: { type: "string" },
  aumTier: { type: "string" },
  // upgrade
  beta:  { type: "boolean", default: false },
  check: { type: "boolean", default: false },
  // config profile
  force: { type: "boolean", default: false },
  // onchain-earn
  productId: { type: "string" },
  protocolType: { type: "string" },
  term: { type: "string" },
  tag: { type: "string" },
  allowEarlyRedeem: { type: "boolean", default: false },
  state: { type: "string" },
  // dcd
  quoteId: { type: "string" },
  notionalCcy: { type: "string" },
  optType: { type: "string" },
  baseCcy: { type: "string" },
  beginId: { type: "string" },
  endId: { type: "string" },
  begin: { type: "string" },
  end: { type: "string" },
  minYield: { type: "string" },
  strikeNear: { type: "string" },
  termDays: { type: "string" },
  minTermDays: { type: "string" },
  maxTermDays: { type: "string" },
  expDate: { type: "string" },
  minAnnualizedYield: { type: "string" },
  // indicator
  params: { type: "string" },
  list: { type: "boolean", default: false },
  "backtest-time": { type: "string" },
  // pair-spread
  window: { type: "string" },
  // news
  coins: { type: "string" },
  sentiment: { type: "string" },
  importance: { type: "string" },
  platform: { type: "string" },
  keyword: { type: "string" },
  "detail-lvl": { type: "string" },
  period: { type: "string" },
  points: { type: "string" },
  "sort-by": { type: "string" },
  region: { type: "string" },
  // skill marketplace
  categories: { type: "string" },
  dir: { type: "string" },
  page: { type: "string" },
  format: { type: "string" },
  // auth
  site: { type: "string" },
  manual: { type: "boolean", default: false },
  // event contract
  underlying: { type: "string" },
  seriesId: { type: "string" },
  eventId: { type: "string" },
  outcome: { type: "string" },
  // market-filter / oi-change-filter
  sortBy:           { type: "string" },
  sortOrder:        { type: "string" },
  minLast:          { type: "string" },
  maxLast:          { type: "string" },
  minChg24hPct:     { type: "string" },
  maxChg24hPct:     { type: "string" },
  minMarketCapUsd:  { type: "string" },
  maxMarketCapUsd:  { type: "string" },
  minVolUsd24h:     { type: "string" },
  maxVolUsd24h:     { type: "string" },
  minFundingRate:   { type: "string" },
  maxFundingRate:   { type: "string" },
  minOiUsd:         { type: "string" },
  maxOiUsd:         { type: "string" },
  instFamily:       { type: "string" },
  ctType:           { type: "string" },
  settleCcy:        { type: "string" },
  ts:               { type: "string" },
  minAbsOiDeltaPct: { type: "string" },
  // diagnostics — cli/mcp/all/output are diagnose-specific; verbose is shared
  verbose: { type: "boolean", default: false },
  mcp: { type: "boolean", default: false }, // diagnose --mcp only: MCP server checks
  cli: { type: "boolean", default: false }, // diagnose --cli only: CLI/general checks (explicit alias for default)
  all: { type: "boolean", default: false }, // diagnose --all: run both CLI and MCP checks
  output: { type: "string" },               // diagnose --output only: save report to file
} as const;

/**
 * Valid keys in the --tpLevel kv mini-DSL and their OKX field mappings.
 * Phase 3b (issue #183, CLI-only no MCP/skill exposure).
 */
const TP_LEVEL_KEY_MAP: Record<string, string> = {
  px:              "tpOrdPx",
  sz:              "sz",
  kind:            "tpOrdKind",
  triggerPx:       "tpTriggerPx",
  triggerPxType:   "tpTriggerPxType",
  amendPxOnTrigger:"amendPxOnTriggerType",
  clOrdId:         "attachAlgoClOrdId",
};

/**
 * Parse a single --tpLevel kv mini-DSL string into an OKX-field-name object.
 *
 * Syntax: "key:value,key:value,..."
 * Valid keys: px, sz, kind, triggerPx, triggerPxType, amendPxOnTrigger, clOrdId
 *
 * @throws Error with helpful message on invalid syntax or unknown key
 */
export function parseTpLevel(s: string): Record<string, string> {
  if (!s || !s.includes(":")) {
    throw new Error(
      `Invalid --tpLevel format: "${s}". Expected "key:value,key:value,..." (e.g. "px:78000,sz:0.5,kind:limit")`,
    );
  }
  const result: Record<string, string> = {};
  const pairs = s.split(",");
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx < 1) {
      throw new Error(
        `Invalid --tpLevel format: "${pair}". Each entry must be "key:value", not "${pair}". ` +
        `Valid keys: ${Object.keys(TP_LEVEL_KEY_MAP).join(", ")}`,
      );
    }
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    const mapped = TP_LEVEL_KEY_MAP[key];
    if (!mapped) {
      throw new Error(
        `Unknown --tpLevel key: "${key}". Valid keys: ${Object.keys(TP_LEVEL_KEY_MAP).join(", ")}`,
      );
    }
    result[mapped] = value;
  }
  return result;
}

export function parseCli(argv: string[]): { values: CliValues; positionals: string[] } {
  // Pre-process --no-<flag> for boolean options (parseArgs doesn't support negation natively)
  const negated = new Set<string>();
  const filtered = argv.filter((arg) => {
    if (arg.startsWith("--no-")) {
      const key = arg.slice(5);
      if (key in CLI_OPTIONS && (CLI_OPTIONS as Record<string, { type: string }>)[key].type === "boolean") {
        negated.add(key);
        return false;
      }
    }
    return true;
  });

  const { values, positionals } = parseArgs({
    args: filtered,
    options: CLI_OPTIONS,
    allowPositionals: true,
  });

  for (const key of negated) {
    (values as Record<string, unknown>)[key] = false;
  }

  return { values: values as CliValues, positionals };
}
