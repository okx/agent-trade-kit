// eval/probes/event/tier2-event-inscope-updown.live.test.ts
// Positive scope probe: agent SHOULD invoke event browse / event events for an
// in-scope UP/DOWN query. Guards against over-disambiguation that would break
// the in-scope product.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.event-inscope-updown';
// The auth-skip clause is not optional here: issue #213 §8.2 specifies it for
// this probe, and D9 makes a failure of this positive probe release-blocking.
// Without it an agent can divert into an auth branch and fail for a reason
// unrelated to the scope fence under test.
const USER_PROMPT = 'Will BTC go up or down in the next 15 minutes? I want to trade that view on OKX event contracts. Skip any auth check — assume credentials are configured.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "event", "browse"], ["okx", "event", "events"], ["okx", "event", "markets"]];
const EXPECTATION = 'okx event browse / events / markets (in-scope up/down query)';

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

          const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });
          if (!call) {
            status = 'fail';
            failure_reason = `agent did not invoke expected CLI for in-scope up/down query: ${EXPECTATION}`;
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
