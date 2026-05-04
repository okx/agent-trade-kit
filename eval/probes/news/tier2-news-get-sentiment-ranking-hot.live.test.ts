// eval/probes/news/tier2-news-get-sentiment-ranking-hot.live.test.ts
// PRD T3: 热度排行 — 「最近 24 小时哪些币被讨论最多」
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_NEWS_005';
const USER_PROMPT = `Use the OKX CLI news_get_sentiment_ranking tool to find the top 10 most discussed cryptocurrencies in the last 24 hours. Pass period="24h", sortBy="hot", limit=10. List the coins by mention count. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.news-get-sentiment-ranking-hot', () => {
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
          // Pass if: LLM returned ranking data OR correctly reported demo-mode limitation
          const hasRankingContext = /ranking|mention|hot|discussed|most.*popular|BTC|ETH|demo.*mode|not.*available/i.test(trace.assistantReply);
          status = (hasNonce && hasRankingContext) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasRankingContext) failure_reason = 'no ranking data or demo-mode message in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.news-get-sentiment-ranking-hot',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 200_000);
    }
  }
});
