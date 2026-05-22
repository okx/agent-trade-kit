// eval/probes/account/tier2-account_get_balance_all.live.test.ts
// Trace-based probe: verifies the agent calls `okx account balance-all`
// when asked for total/net-worth/aggregated balance.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.account_get_balance_all';
const USER_QUERIES = [
  'how much do I have in total?',
  '总资产',
  'show all my assets',
  'net worth in BTC',
];
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "account", "balance-all"]];
const EXPECTATION = 'okx account balance-all';

describe(PROBE_ID, () => {
  const models = getModels();
  const runsPerModel = getRunsPerModel();
  for (const model of models) {
    for (let attempt = 1; attempt <= runsPerModel; attempt++) {
      const userPrompt = USER_QUERIES[(attempt - 1) % USER_QUERIES.length]
        + ' — Skip any auth check, assume credentials are configured. Do NOT run okx auth login or okx config init. Just run the appropriate okx CLI command once.';
      it(`${model} attempt ${attempt}: "${USER_QUERIES[(attempt - 1) % USER_QUERIES.length]}"`, async () => {
        const t0 = Date.now();
        let trace: Awaited<ReturnType<typeof runAgent>> | null = null;
        let status: 'pass' | 'fail' | 'error' = 'error';
        let failure_reason: string | undefined;
        const evidence: Record<string, unknown> = {};
        try {
          trace = await runAgent({ userPrompt, timeoutMs: 300_000 });
          evidence.tool_calls = summarizeToolCalls(trace);
          evidence.reply_tail = trace.assistantReply.slice(-400);
          evidence.expected = EXPECTATION;

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
