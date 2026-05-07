// eval/probes/news/tier2-news-get-coin-sentiment-single.live.test.ts
// Verify the agent invokes `okx news coin-sentiment` with the correct flags
// when asked about BTC's 24h sentiment. Assertions target the tool_use trace
// (intent + parameters), not the upstream API response — auth/401 from the
// OKX server is irrelevant; what matters is that the LLM picked the right
// tool and passed the right arguments.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.news-get-coin-sentiment-single';
const USER_PROMPT =
  'Get the current bullish/bearish sentiment for BTC over the last 24 hours. ' +
  'Report the sentiment label, bullish ratio, and total mention count.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ['okx', 'news', 'coin-sentiment', 'BTC'],
];
const EXPECTATION = 'okx news coin-sentiment with --coins BTC';

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

          // Show every tool call the agent made — primary debugging surface.
          evidence.tool_calls = summarizeToolCalls(trace);
          evidence.reply_tail = trace.assistantReply.slice(-400);
          evidence.expected = EXPECTATION;

          // Use commandPatterns (OR-of-AND) like all other probes.
          const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });

          if (!call) {
            status = 'fail';
            failure_reason = `agent did not invoke expected CLI: ${EXPECTATION}`;
          } else {
            evidence.matched_call = { name: call.name, command: call.input.command };
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
