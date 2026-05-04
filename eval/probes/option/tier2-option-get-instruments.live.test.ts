// eval/probes/option/tier2-option-get-instruments.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_OPT_001';
const USER_PROMPT = `Use the OKX CLI option_get_instruments tool to list available BTC option contracts expiring this month. Show at least 3 instrument IDs. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.option-get-instruments', () => {
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
          const hasOption = /BTC.*option|option.*BTC|call|put|strike|expir/i.test(trace.assistantReply);
          status = (hasNonce && hasOption) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasOption) failure_reason = 'no option instrument data in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.option-get-instruments',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
