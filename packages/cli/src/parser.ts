import { parseArgs } from "node:util";

export interface CliValues {
  profile?: string;
  demo?: boolean;
  json?: boolean;
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
  stopType?: string;
  live?: boolean;
  // grid create extended
  algoClOrdId?: string;
  tpRatio?: string;
  slRatio?: string;
  tradeQuoteCcy?: string;
  // grid extended commands
  mktClose?: boolean;
  topupAmount?: string;
  topUpAmt?: string;
  allowReinvestProfit?: string;
  percent?: string;
  gridType?: string;
  investmentType?: string;
  // rsi back testing / ai param
  timeframe?: string;
  thold?: string;
  timePeriod?: string;
  triggerCond?: string;
  duration?: string;
  instType?: string;
  quoteCcy?: string;
  archive?: boolean;
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
  // dca bot (contract only)
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
  cycleId?: string;
  lang?: string;
  // option
  uly?: string;
  expTime?: string;
  // batch
  action?: string;
  orders?: string;
  // earn
  rate?: string;
  // audit
  since?: string;
  tool?: string;
  // config profile
  force?: boolean;
  // twap bot
  pxVar?: string;
  pxSpread?: string;
  szLimit?: string;
  pxLimit?: string;
  timeInterval?: string;
  algoClOrdId?: string;
  tgtCcy?: string;
  tradeQuoteCcy?: string;
  isTradeBorrowMode?: boolean;
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
  // diagnostics
  verbose?: boolean;
}

export const CLI_OPTIONS = {
  profile: { type: "string" },
  demo: { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  help: { type: "boolean", default: false },
  version: { type: "boolean", short: "v", default: false },
  // setup command
  client: { type: "string" },
  modules: { type: "string" },
  // market candles
  bar: { type: "string" },
  limit: { type: "string" },
  sz: { type: "string" },
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
  stopType: { type: "string" },
  live: { type: "boolean", default: false },
  // grid create extended
  algoClOrdId: { type: "string" },
  tpRatio: { type: "string" },
  slRatio: { type: "string" },
  tradeQuoteCcy: { type: "string" },
  // grid extended commands
  mktClose: { type: "boolean", default: false },
  topupAmount: { type: "string" },
  topUpAmt: { type: "string" },
  allowReinvestProfit: { type: "string" },
  percent: { type: "string" },
  gridType: { type: "string" },
  investmentType: { type: "string" },
  // rsi back testing / ai param
  timeframe: { type: "string" },
  thold: { type: "string" },
  timePeriod: { type: "string" },
  triggerCond: { type: "string" },
  duration: { type: "string" },
  // market extras
  instType: { type: "string" },
  quoteCcy: { type: "string" },
  // account extras
  archive: { type: "boolean", default: false },
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
  // dca bot (contract only)
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
  cycleId: { type: "string" },
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
  // audit
  since: { type: "string" },
  tool: { type: "string" },
  // config profile
  force: { type: "boolean", default: false },
  // twap bot
  pxVar: { type: "string" },
  pxSpread: { type: "string" },
  szLimit: { type: "string" },
  pxLimit: { type: "string" },
  timeInterval: { type: "string" },
  algoClOrdId: { type: "string" },
  tgtCcy: { type: "string" },
  tradeQuoteCcy: { type: "string" },
  isTradeBorrowMode: { type: "boolean", default: false },
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
  // diagnostics
  verbose: { type: "boolean", default: false },
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
