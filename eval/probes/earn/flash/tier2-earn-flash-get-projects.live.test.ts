// eval/probes/earn/flash/tier2-earn-flash-get-projects.live.test.ts
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_EARN_FL_001';
const USER_PROMPT = `[Automated eval — no human will respond] Use the OKX CLI earn_get_flash_earn_projects tool to list available Flash Earn projects. Show their names and APY rates. Constraints: do NOT start an OAuth login flow, do NOT prompt for credentials, do NOT offer auth-method menus. If the tool fails or auth is unavailable, briefly note the failure and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.earn-flash-get-projects', () => {
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
          trace = await runAgent({ userPrompt: USER_PROMPT, timeoutMs: 300_000 });
          evidence.reply_tail = trace.assistantReply.slice(-800);
          const hasNonce = trace.assistantReply.includes(EVAL_NONCE);
          const hasFlashData = /flash|earn|project|APY|rate|product/i.test(trace.assistantReply);
          status = (hasNonce && hasFlashData) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasFlashData) failure_reason = 'no flash earn data in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.earn-flash-get-projects',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 320_000);
    }
  }
});
