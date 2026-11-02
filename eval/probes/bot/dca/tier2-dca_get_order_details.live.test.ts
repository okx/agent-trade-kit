// eval/probes/bot/dca/tier2-dca_get_order_details.live.test.ts
// `dca_get_order_details` (`okx bot dca details`) is DEPRECATED in favour of `dca_get_positions`
// (`okx bot dca positions`, same endpoint; see skills/okx-cex-bot/SKILL.md and dca-commands.md).
// `details` still works, so this probe no longer asks for it. It guards the deprecation guidance
// instead: a vague "details of my DCA bot" request must reach `okx bot dca positions`.
// tier2-dca_get_positions covers the explicit "show the open position" wording.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.dca-get-order-details';
const USER_PROMPT = 'Get the details of my contract DCA bot with algoId 12345. Skip any auth check — assume credentials are configured. Do NOT run okx auth login or okx config init. Just run the appropriate okx CLI command once.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "bot", "dca", "positions"]];
// The deprecated command still runs, but the skill tells the agent to use `positions`.
const DEPRECATED_COMMAND_PATTERNS: string[][] = [["okx", "bot", "dca", "details"]];
const EXPECTATION = 'okx bot dca positions (not the deprecated okx bot dca details)';

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
          const deprecated = findToolCall(trace, { commandPatterns: DEPRECATED_COMMAND_PATTERNS });
          evidence.used_deprecated_details = Boolean(deprecated);
          if (!call) {
            status = 'fail';
            failure_reason = deprecated
              ? 'agent used the deprecated okx bot dca details; the skill says to use okx bot dca positions'
              : `agent did not invoke expected CLI: ${EXPECTATION}`;
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
