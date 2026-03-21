/**
 * Event Contract Glossary
 *
 * Centralized reference for field semantics, output conventions, and
 * presentation rules for the event contract module.
 *
 * Tool descriptions import this string and embed it to avoid repetition.
 * When a rule changes, update it here — all tools pick it up automatically.
 */

/**
 * Shared presentation rules injected into relevant tool descriptions.
 * Keep this concise — only rules that apply across ≥2 tools.
 */
export const EVENT_PRESENTATION_RULES = `
FIELD SEMANTICS (event contract responses):
  outcome          "pending"=not settled, "YES"=YES won, "NO"=NO won  (already translated — never show raw "0"/"1"/"2")
  floorStrike      strike price: if underlying >= floorStrike at expiry → YES wins
  expTime          expiry datetime (already ISO 8601 — convert to "YYYY-MM-DD HH:mm UTC" + relative time remaining)
  settleTime       settlement datetime (ISO 8601); absent = not yet settled
  settleValue      reference price used for settlement (only present on expired markets)
  estCost          upfront premium paid to enter the position
  estFee           settlement fee — charged at EXPIRY, NOT upfront
  maxLoss          = estCost + estFee  (worst-case total outlay)
  netMaxWin        = estMaxWin - estCost - estFee  (net profit if bet is correct)
  riskRewardRatio  = netMaxWin / maxLoss
  px               probability value 0.00–1.00, NOT a regular asset price (e.g. 0.45 = 45% implied probability)
  pos              total position size (contracts held)
  availPos         available (unfrozen) size; frozen = pos - availPos (frozen = open orders occupying margin)

UNIVERSAL RULES:
  - NEVER show raw millisecond timestamps, API field names, sCode, ok:true, or data:null to users.
  - NEVER show "YES(1)", "NO(2)", or any "(number)" notation.
  - Omit empty/null/zero fields silently.
  - Express all times as: "YYYY-MM-DD HH:mm UTC (approx X hours remaining)" or equivalent in user's language.
`.trim();

/**
 * Fixed 7-field precheck output template.
 * Embedded in event_precheck_order description.
 */
export const PRECHECK_TEMPLATE = `
HOW TO PRESENT precheck results — always use this template:
  Contract:      {instId}
  Win condition: If {underlying} >= {floorStrike} at expiry → YES wins  (or: price rises → UP wins)
  Expires:       {expTime ISO} (approx X hours remaining)
  ──────────────────────────────────────
  Entry cost:    {estCost} USDC
  Max loss:      {maxLoss} USDC  (fee charged at settlement, not upfront)
  Net max win:   {netMaxWin} USDC
  Risk/reward:   {riskRewardRatio}
  ──────────────────────────────────────
  If riskRewardRatio < 0.1 OR estFee/estCost > 0.3:
    ⚠️ Fee is high (approx X% of cost). Consider a limit/post_only order for lower Maker fee rate.
`.trim();
