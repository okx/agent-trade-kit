// eval/probes/earn/dcd/tier2-earn-dcd-get-products.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_EARN_DCD_001';
const USER_PROMPT = `Use the OKX CLI dcd_get_products tool to list available Dual Currency Deposit products for BTC-USDT. Show the available strike prices or yields. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.earn-dcd-get-products', () => {
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
          const hasDcdData = /dual|currency|deposit|DCD|strike|yield|BTC/i.test(trace.assistantReply);
          status = (hasNonce && hasDcdData) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasDcdData) failure_reason = 'no DCD product data in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.earn-dcd-get-products',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
