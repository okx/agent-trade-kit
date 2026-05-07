// eval/probes/news/tier2-news-get-coin-sentiment-single.live.test.ts
// PRD T1: 单币情绪概览 — 「BTC 最近多空情绪怎么样」
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_NEWS_002';
const USER_PROMPT = `[Automated eval — no human will respond] Use the OKX CLI news_get_coin_sentiment tool to get the current bullish/bearish sentiment for BTC over the last 24 hours. Report the sentiment label (bullish/bearish/neutral/mixed), bullish ratio, and total mention count. Constraints: do NOT start an OAuth login flow, do NOT prompt the user with auth menus, do NOT ask for credentials. If the tool fails or auth is unavailable, briefly note the failure in one short paragraph and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.news-get-coin-sentiment-single', () => {
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
          // Pass if: LLM returned sentiment data OR correctly reported demo-mode limitation
          const hasContext = /bullish|bearish|neutral|mixed|sentiment|mention|demo.*mode|not.*available|auth|credential|401|unauthorized|login|API.?key|not.*configured|requires.*authentication/i.test(trace.assistantReply);
          status = (hasNonce && hasContext) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasContext) failure_reason = 'no sentiment data or demo-mode message in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.news-get-coin-sentiment-single',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 320_000);
    }
  }
});
