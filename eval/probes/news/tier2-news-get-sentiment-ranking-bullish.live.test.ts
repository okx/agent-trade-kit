// eval/probes/news/tier2-news-get-sentiment-ranking-bullish.live.test.ts
// PRD T4: 看多排行 — 「最近看多的币有哪些」
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_NEWS_006';
const USER_PROMPT = `Use the OKX CLI news_get_sentiment_ranking tool to find the most bullish cryptocurrencies right now. Pass period="24h", sortBy="bullish". List the top coins with the highest bullish ratio. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.news-get-sentiment-ranking-bullish', () => {
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
          // Pass if: LLM returned bullish ranking OR correctly reported demo-mode limitation
          const hasBullishContext = /bullish|most.*bull|bullish.*ratio|sentiment.*ranking|demo.*mode|not.*available/i.test(trace.assistantReply);
          status = (hasNonce && hasBullishContext) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasBullishContext) failure_reason = 'no bullish ranking or demo-mode message in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.news-get-sentiment-ranking-bullish',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
