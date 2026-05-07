// eval/probes/swap/tier2-swap-place-order.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_SWAP_002';
const USER_PROMPT = `[Automated eval — no human will respond] Use the OKX CLI swap_place_order tool to place a market buy order for 1 contract of BTC-USDT-SWAP. The system is in demo/dry-run mode. Report the command used and result. Constraints: do NOT start an OAuth login flow, do NOT prompt for credentials, do NOT offer auth-method menus. If the tool fails or auth is unavailable, briefly note the failure and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.swap-place-order', () => {
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
          const attemptedTool = /swap.*order|SWAP|perpetual.*buy|market.*buy/i.test(trace.assistantReply);
          status = (hasNonce && attemptedTool) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!attemptedTool) failure_reason = 'LLM did not attempt swap place-order';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.swap-place-order',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
