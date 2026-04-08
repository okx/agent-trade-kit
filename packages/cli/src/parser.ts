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
  live?: boolean;
  instType?: string;
  instCategory?: string;
  quoteCcy?: string;
  archive?: boolean;
  valuation?: boolean;
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
  reqId?: string;
  confirm?: boolean;
  // audit
  since?: string;
  tool?: string;
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
  // market candle time range
  after?: string;
  before?: string;
  // skill marketplace
  keyword?: string;
  categories?: string;
  dir?: string;
  page?: string;
  format?: string;
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
  live: { type: "boolean", default: false },
  // market extras
  instType: { type: "string" },
  instCategory: { type: "string" },
  quoteCcy: { type: "string" },
  // account extras
  archive: { type: "boolean", default: false },
  valuation: { type: "boolean", default: false },
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
  reqId: { type: "string" },
  confirm: { type: "boolean", default: false },
  // audit
  since: { type: "string" },
  tool: { type: "string" },
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
  // skill marketplace
  keyword: { type: "string" },
  categories: { type: "string" },
  dir: { type: "string" },
  page: { type: "string" },
  format: { type: "string" },
  // diagnostics — cli/mcp/all/output are diagnose-specific; verbose is shared
  verbose: { type: "boolean", default: false },
  mcp: { type: "boolean", default: false }, // diagnose --mcp only: MCP server checks
  cli: { type: "boolean", default: false }, // diagnose --cli only: CLI/general checks (explicit alias for default)
  all: { type: "boolean", default: false }, // diagnose --all: run both CLI and MCP checks
  output: { type: "string" },               // diagnose --output only: save report to file
} as const;

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
