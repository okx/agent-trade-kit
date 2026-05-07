// eval/probes/spot/tier2-spot-place-order.live.test.ts
// Auto-generated trace-based probe. Asserts that the agent invoked the
// expected `okx` CLI command via the `exec` tool. Tool-call intent +
// parameters is what we measure; upstream API auth/401 errors are not.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.spot-place-order';
const USER_PROMPT = 'Place a limit buy order for 0.001 BTC-USDT at price 1 USDT in demo/dry-run mode using the okx spot place subcommand. Report the exact command you ran. Skip any auth check — assume credentials are configured. Do NOT run okx auth login or okx config init or okx --help. Just run the okx spot place command once.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "spot", "place", "BTC-USDT", "buy", "0.001"]];
const EXPECTATION = 'okx spot place BTC-USDT buy 0.001';

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
