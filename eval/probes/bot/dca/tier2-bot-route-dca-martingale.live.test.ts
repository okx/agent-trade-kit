// eval/probes/bot/dca/tier2-bot-route-dca-martingale.live.test.ts
// Routing probe (not tied to one tool): a Martingale-style request (first order, add on every
// 3% dip, take profit) that uses none of the product words ("DCA", "马丁", "Martingale",
// "定投", "Recurring") must still reach the DCA bot, not Recurring Buy. The routing has to come
// from the safety-order / buy-the-dip wording, not from a keyword.
// See skills/okx-cex-bot/SKILL.md Step 1.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.bot-route-dca-martingale';
const USER_PROMPT = "在模拟盘/dry-run 模式下帮我做一个 BTC 现货策略：方向做多，首单买入 50 USDT，价格每下跌 3% 就加仓买入 50 USDT，最多加仓 3 次，整体盈利 3% 就止盈。Skip any auth check — assume credentials are configured. Do NOT run okx auth login or okx config init. Just run the appropriate okx CLI command once.";
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "bot", "dca", "create"]];
// Recurring Buy has no safety orders, so creating it here is a misroute. It is a real-money
// action, so it fails the probe even when the expected `dca create` is also present.
const MISROUTE_COMMAND_PATTERNS: string[][] = [["okx", "bot", "recurring", "create"]];
const EXPECTATION = 'okx bot dca create (not okx bot recurring create)';

describe(PROBE_ID, () => {
  const models = getModels();
  const runsPerModel = getRunsPerModel();
  for (const model of models) {
    for (let attempt = 1; attempt <= runsPerModel; attempt++) {
      it(`${model} attempt ${attempt}`, async () => {
        const t0 = Date.now();
        let trace: Awaited<ReturnType<typeof runAgent>> | null = null;
        let status: 'pass' | 'fail' | 'error' = 'error';
        let failure_reason: string | undefined;
        const evidence: Record<string, unknown> = {};
        try {
          trace = await runAgent({ userPrompt: USER_PROMPT, timeoutMs: 300_000 });
          evidence.tool_calls = summarizeToolCalls(trace);
          evidence.reply_tail = trace.assistantReply.slice(-400);
          evidence.expected = EXPECTATION;

          const misrouted = findToolCall(trace, { commandPatterns: MISROUTE_COMMAND_PATTERNS });
          evidence.misrouted_to_recurring = Boolean(misrouted);
          const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });
          if (misrouted) {
            evidence.misrouted_call = { name: misrouted.name, command: misrouted.input.command };
            status = 'fail';
            failure_reason = 'agent created okx bot recurring for a Martingale request (wrong product, even if dca create was also run)';
          } else if (!call) {
            status = 'fail';
            failure_reason = `agent did not invoke expected CLI: ${EXPECTATION}`;
          } else {
            evidence.matched_call = { name: call.name, command: call.input.command };
            status = 'pass';
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          failure_reason = msg;
          evidence.error = msg;
        }
        recordResult({
          probe_id: PROBE_ID,
          tier: 2, llm_model: model, attempt, status,
          duration_ms: Date.now() - t0, evidence, failure_reason,
          llm_tokens_in: trace?.tokensIn, llm_tokens_out: trace?.tokensOut,
        });
      }, 320_000);
    }
  }
});
