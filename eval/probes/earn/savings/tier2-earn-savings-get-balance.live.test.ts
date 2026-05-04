// eval/probes/earn/savings/tier2-earn-savings-get-balance.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_EARN_SAV_001';
const USER_PROMPT = `Use the OKX CLI earn_get_savings_balance tool to check my Simple Earn savings balance. Report the currencies and amounts held. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.earn-savings-get-balance', () => {
  const models = getModels();
  const runsPerModel = getRunsPerModel();
  for (const model of models) {
    for (let attempt = 1; attempt <= runsPerModel; attempt++) {
      it(`${model} attempt ${attempt}`, async () => {
        const t0 = Date.now();
        let trace: any = null;
        let status: 'pass' | 'fail' | 'error' = 'error';
        let failure_reason: string | undefined;
        const evidence: any = {};
        try {
          trace = await runAgent({ userPrompt: USER_PROMPT, timeoutMs: 180_000 });
          evidence.reply_tail = trace.assistantReply.slice(-800);
          const hasNonce = trace.assistantReply.includes(EVAL_NONCE);
          const hasEarnContext = /earn|saving|balance|USDT|no.*holding|empty/i.test(trace.assistantReply);
          status = (hasNonce && hasEarnContext) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasEarnContext) failure_reason = 'no earn/savings context in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.earn-savings-get-balance',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
