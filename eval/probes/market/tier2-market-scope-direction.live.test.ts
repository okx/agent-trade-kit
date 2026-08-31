// eval/probes/market/tier2-market-scope-direction.live.test.ts
// Guard probe for the OTHER direction of the event-contract fence.
//
// tier2-event-inscope-updown checks that "I want to trade this direction as an
// event contract" reaches `okx event`. This one checks the converse: a bare
// directional question is still a market-data question and must be answered
// here, with candles or an indicator.
//
// Why it exists: the fence added to skills/okx-cex-market/SKILL.md is a new
// constraint on skill selection, and issue #213 §D9 rates "消歧文案写过头,
// 误伤在线功能" as the risk that blocks a release. Every market probe as of
// 2026-08-31 is instrument+command shaped ("Get the last 5 one-hour candles for
// ETH-USDT"), so none of them would notice the fence over-firing. Without this
// probe a green run cannot distinguish "fence works" from "fence works and
// broke ordinary market queries".
//
// Note the prompt carries no trading verb — no "trade", "buy", "bet",
// "position". That is the whole point: the discriminator in SKILL.md is trading
// intent, not the words "up" or "down".
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.market-scope-direction';
const USER_PROMPT =
  'Is BTC going up or down over the last 15 minutes? Just tell me which way it is moving. ' +
  'Skip any auth check — assume credentials are configured. ' +
  'Do NOT run okx auth login or okx config init.';
// Either answer is correct — candles show direction directly, an indicator
// (supertrend / ema / macd) summarises it.
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ["okx", "market", "candles"],
  ["okx", "market", "indicator"],
  ["okx", "market", "ticker"],
];
// Evidence only, never fails the probe: reaching for the event family on a
// read-only question is the over-fire signature. Recorded so a human can see it
// while reading results, without turning a judgement call into a hard failure
// (issue #213 §8.4 — trace assertions are a conservative lower bound).
const OVERFIRE_COMMAND_PATTERNS: string[][] = [
  ["okx", "event", "browse"],
  ["okx", "event", "series"],
  ["okx", "event", "markets"],
];
const EXPECTATION = 'okx market candles / indicator / ticker — stays in the market skill';

describe(PROBE_ID, () => {
  const models = getModels();
  const runsPerModel = getRunsPerModel();
  for (const model of models) {
    for (let attempt = 1; attempt <= runsPerModel; attempt++) {
      it(`${model} attempt ${attempt}`, async () => {
        const t0 = Date.now();
        let trace: Awaited<ReturnType<typeof runAgent>> | null = null;
        let status: 'pass' | 'fail' | 'error' = 'error';
        let failure_reason: string | undefined;
        const evidence: Record<string, unknown> = {};
        try {
          trace = await runAgent({ userPrompt: USER_PROMPT, timeoutMs: 300_000 });
          evidence.tool_calls = summarizeToolCalls(trace);
          evidence.reply_tail = trace.assistantReply.slice(-800);
          evidence.expected = EXPECTATION;

          const overfireCall = findToolCall(trace, { commandPatterns: OVERFIRE_COMMAND_PATTERNS });
          evidence.event_family_call = overfireCall
            ? { name: overfireCall.name, command: overfireCall.input?.command }
            : null;

          const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });
          if (!call) {
            status = 'fail';
            failure_reason = `agent did not invoke expected CLI: ${EXPECTATION}`;
          } else {
            evidence.matched_call = { name: call.name, command: call.input?.command };
            status = 'pass';
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          failure_reason = msg;
          evidence.error = msg;
        }
        recordResult({
          probe_id: PROBE_ID,
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 320_000);
    }
  }
});
