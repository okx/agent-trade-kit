// eval/probes/smartmoney/tier2-smartmoney-get-traders.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_SM_001';
const USER_PROMPT = `[Automated eval — no human will respond] Use the OKX CLI smartmoney_get_traders tool to list the top 5 smart money traders by PnL. Show their IDs or addresses and performance. Constraints: do NOT start an OAuth login flow, do NOT prompt the user with auth menus, do NOT ask for credentials. If the tool fails or auth is unavailable, briefly note the failure in one short paragraph and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.smartmoney-get-traders', () => {
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
          const hasTraderData = /trader|smart.*money|PnL|profit|address/i.test(trace.assistantReply);
          status = (hasNonce && hasTraderData) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasTraderData) failure_reason = 'no trader data in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.smartmoney-get-traders',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
