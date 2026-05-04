// eval/probes/earn/onchain/tier2-earn-onchain-get-offers.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_EARN_OC_001';
const USER_PROMPT = `Use the OKX CLI onchain_earn_get_offers tool to list available on-chain earn products. Show at least 2 offers with their APY or yield rates. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.earn-onchain-get-offers', () => {
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
          const hasOfferData = /offer|APY|yield|rate|on.chain|staking|product/i.test(trace.assistantReply);
          status = (hasNonce && hasOfferData) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasOfferData) failure_reason = 'no offer/APY data in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.earn-onchain-get-offers',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
