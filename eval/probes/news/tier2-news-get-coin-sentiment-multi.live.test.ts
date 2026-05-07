// eval/probes/news/tier2-news-get-coin-sentiment-multi.live.test.ts
// PRD T2: 多币情绪对比 — 「ETH 和 SOL 的情绪对比」
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_NEWS_003';
const USER_PROMPT = `[Automated eval — no human will respond] Use the OKX CLI news_get_coin_sentiment tool to compare the sentiment for ETH and SOL over the last 24 hours. Call it with coins="ETH,SOL". Report the sentiment label and bullish ratio for each coin side by side. Constraints: do NOT start an OAuth login flow, do NOT prompt the user with auth menus, do NOT ask for credentials. If the tool fails or auth is unavailable, briefly note the failure in one short paragraph and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.news-get-coin-sentiment-multi', () => {
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
          // Pass if: LLM returned data for both coins OR correctly reported demo-mode limitation
          const hasEth = /ETH/i.test(trace.assistantReply);
          const hasSol = /SOL/i.test(trace.assistantReply);
          const hasDemoFallback = /demo.*mode|not.*available/i.test(trace.assistantReply);
          const hasContext = (hasEth && hasSol) || hasDemoFallback;
          status = (hasNonce && hasContext) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasEth && !hasDemoFallback) failure_reason = 'ETH missing from reply';
          else if (!hasSol && !hasDemoFallback) failure_reason = 'SOL missing from reply';
          else if (!hasContext) failure_reason = 'no multi-coin comparison or demo-mode message';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.news-get-coin-sentiment-multi',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
