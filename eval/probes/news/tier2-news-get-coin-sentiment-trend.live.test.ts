// eval/probes/news/tier2-news-get-coin-sentiment-trend.live.test.ts
// PRD T5: 情绪变化趋势 — 「BTC 最近 24 小时逐小时情绪变化」
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_NEWS_004';
const USER_PROMPT = `[Automated eval — no human will respond] Use the OKX CLI news_get_coin_sentiment tool to get BTC sentiment trend for the last 24 hours with hourly granularity. Pass coins="BTC", period="1h", trendPoints=24. Report how the bullish ratio changed over the 24 data points. Constraints: do NOT start an OAuth login flow, do NOT prompt for credentials, do NOT offer auth-method menus. If the tool fails or auth is unavailable, briefly note the failure and STILL include "${EVAL_NONCE}" verbatim somewhere in your final reply.`;

describe('tier2.news-get-coin-sentiment-trend', () => {
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
          // Pass if: LLM returned trend data OR correctly reported demo-mode limitation
          const hasTrendContext = /trend|hour|1h|time.*point|bullish.*ratio|sentiment.*change|demo.*mode|not.*available/i.test(trace.assistantReply);
          status = (hasNonce && hasTrendContext) ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce missing';
          else if (!hasTrendContext) failure_reason = 'no trend data or demo-mode message in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.news-get-coin-sentiment-trend',
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 320_000);
    }
  }
});
