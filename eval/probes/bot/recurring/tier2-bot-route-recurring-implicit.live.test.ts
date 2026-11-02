// eval/probes/bot/recurring/tier2-bot-route-recurring-implicit.live.test.ts
// Routing probe (not tied to one tool): a clear periodic fixed-amount request that
// names neither "DCA" nor "定投" must still reach Recurring Buy, not the Martingale DCA bot.
// See skills/okx-cex-bot/SKILL.md Step 1.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.bot-route-recurring-implicit';
const USER_PROMPT = "在模拟盘/dry-run 模式下帮我设置：每周一 09:00（UTC+8，时区 8）固定买入 100 USDT 的 BTC，资金来自交易账户（账户是 acctLv 1 的简单模式，tdMode 用 cash）。Skip any auth check — assume credentials are configured. Do NOT run okx auth login or okx config init. Just run the appropriate okx CLI command once.";
const EXPECTED_COMMAND_PATTERNS: string[][] = [["okx", "bot", "recurring", "create"]];
// Creating the Martingale bot for a periodic fixed-amount request is the misrouting this probe
// guards against. It is a real-money action, so it fails the probe even when the expected
// `recurring create` is also present.
const MISROUTE_COMMAND_PATTERNS: string[][] = [["okx", "bot", "dca", "create"]];
const EXPECTATION = 'okx bot recurring create (not okx bot dca create)';

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
          evidence.misrouted_to_dca = Boolean(misrouted);
          const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });
          if (misrouted) {
            evidence.misrouted_call = { name: misrouted.name, command: misrouted.input.command };
            status = 'fail';
            failure_reason = 'agent created okx bot dca for a periodic fixed-amount request (wrong product, even if recurring create was also run)';
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
