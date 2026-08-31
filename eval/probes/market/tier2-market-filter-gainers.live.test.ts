// eval/probes/market/tier2-market-filter-gainers.live.test.ts
// The price half of the "most bullish coins" split.
//
// Its sibling, eval/probes/news/tier2-news-get-sentiment-ranking-bullish, asks
// for the most bullish *news sentiment* and must reach `okx news sentiment-rank`.
// This one asks for the biggest *price* gainers and must reach the price
// screener. Together they pin both readings of "bullish", which as a bare word
// is ambiguous — four eval rounds were spent on a probe that accepted only one
// of the two and scored the other as a failure.
//
// Distinct from tier2-market-filter, which ranks by 24h volume. This ranks by
// 24h price change, the dimension that collides with sentiment wording.
//
// The assertion does not require a specific sort flag: `--sortBy chg24hPct`,
// `--minChg24hPct`, and sorting `market tickers` output client-side are all
// legitimate ways to answer, and pinning one would make the probe brittle
// without measuring anything more.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.market-filter-gainers';
const USER_PROMPT =
  'Which coins have gained the most in price over the last 24 hours? ' +
  'Skip any auth check — assume credentials are configured. ' +
  'Do NOT run okx auth login or okx config init.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ["okx", "market", "filter"],
  ["okx", "market", "tickers"],
];
// Evidence only, never fails the probe: a price-gainers question answered from
// the news/sentiment family is the mirror image of the failure this pair exists
// to separate. Recorded so a human reading results can see the confusion
// happening in the other direction.
const CROSSOVER_COMMAND_PATTERNS: string[][] = [
  ["okx", "news", "sentiment-rank"],
];
const EXPECTATION = 'okx market filter / tickers — price ranking, not sentiment';

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

          const crossover = findToolCall(trace, { commandPatterns: CROSSOVER_COMMAND_PATTERNS });
          evidence.sentiment_family_call = crossover
            ? { name: crossover.name, command: crossover.input?.command }
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
