// eval/probes/bot/smart-portfolio/tier2-smart_portfolio_add_investment.live.test.ts
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.smart-portfolio-add-investment';
const USER_PROMPT = 'Add 100 USDT to my Smart Portfolio bot 123456789 in demo/dry-run mode (only add funds, do not change the coins or weights). I already checked my trading account balance and I confirm the amount and the bot, so submit it now. Skip any auth check — assume credentials are configured. Do NOT run okx auth login or okx config init. Just run the appropriate okx CLI command once.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "bot", "smart-portfolio", "add-investment", "--algoId", "123456789", "--addInvest", "100", "--demo"], ["okx", "bot", "smart-portfolio", "add-investment", "--algoId", "123456789", "--addInvest", "100", "--profile", "demo"]];
const EXPECTATION = 'okx bot smart-portfolio add-investment --algoId 123456789 --addInvest 100 in demo mode';

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
