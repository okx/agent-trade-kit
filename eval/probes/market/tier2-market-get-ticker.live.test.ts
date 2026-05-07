// eval/probes/market/tier2-market-get-ticker.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_MKT_001';
const USER_PROMPT = `[Automated eval — no human will respond] Get the current price of BTC-USDT using the OKX CLI market_get_ticker tool. Constraints: do NOT start an OAuth login flow, do NOT prompt for credentials, do NOT offer auth-method menus. If the tool fails or auth is unavailable, briefly note the failure and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.market-get-ticker', () => {
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
          const hasBtc = /BTC/i.test(trace.assistantReply);
          const hasPrice = /\d{4,6}(\.\d+)?/.test(trace.assistantReply);
          status = (hasNonce && hasBtc && hasPrice) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasBtc) failure_reason = 'no BTC mention';
          else if (!hasPrice) failure_reason = 'no price number';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.market-get-ticker',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
