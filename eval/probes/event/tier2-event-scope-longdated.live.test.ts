// eval/probes/event/tier2-event-scope-longdated.live.test.ts
// Negative scope probe (highest risk): agent should decline long-dated crypto
// prediction requests that resemble prediction-market style questions, NOT invoke
// CEX event contracts as a substitute for month/year horizon forecasts.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.event-scope-longdated';
const USER_PROMPT = 'I want to trade a prediction market contract on whether BTC will be above $200,000 by end of year. Can OKX Outcomes or any prediction market tool help me? Show me available contracts.';
// Agent should NOT invoke event contract tools for year-horizon prediction market requests.
const FORBIDDEN_COMMAND_PATTERNS: string[][] = [["okx", "event", "browse"], ["okx", "event", "events"]];
const EXPECTATION = 'agent declines and does NOT invoke event contract commands for long-dated prediction market requests';

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

          const forbiddenCall = findToolCall(trace, { commandPatterns: FORBIDDEN_COMMAND_PATTERNS });
          if (forbiddenCall) {
            status = 'fail';
            failure_reason = `agent invoked event contract tool for long-dated prediction market: ${forbiddenCall.input?.command}`;
            evidence.forbidden_call = { name: forbiddenCall.name, command: forbiddenCall.input?.command };
          } else {
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
