// eval/probes/option/tier2-option-place-order.live.test.ts
// Auto-generated trace-based probe. Asserts that the agent invoked the
// expected `okx` CLI command via the `exec` tool. Tool-call intent +
// parameters is what we measure; upstream API auth/401 errors are not.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.option-place-order';
// This probe verifies that `okx option place` is reachable — NOT that the agent
// can discover an option instId unaided. That discovery ability has its own
// probe (tier2.option-get-instruments, passing). Bundling both made a failure
// ambiguous: the 2026-08-31 run went 0/3 with the agent correctly resolving a
// valid instId every time and then stopping before `place`, so the earlier
// prompt was measuring the discovery chain, not this command.
//
// Prompt is deliberately structurally equivalent to the spot / swap place
// probes: name the subcommand, require the command to be reported, and require
// one execution even when it errors. instId is prefix-matched (`BTC-USD-`) like
// the futures probe, because option expiries roll weekly/monthly and a
// hardcoded one would rot.
const USER_PROMPT =
  'Place a limit buy order for 1 contract of a near-expiry BTC call option ' +
  '(BTC-USD-YYMMDD-<strike>-C format) at a low premium using the okx option place subcommand. ' +
  'Report the exact command you ran. Even if the command returns an authentication or ' +
  'permission error, still run it once and report it. ' +
  'Skip any auth check — assume credentials are configured. ' +
  'Do NOT run okx auth login or okx config init or okx --help / okx option --help. ' +
  'You may run okx option instruments once to pick a valid instrument ID.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ["okx", "option", "place", "BTC-USD-", "buy"],
];
const EXPECTATION = 'okx option place BTC-USD-<expiry>-<strike>-C buy';

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

          const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });
          if (!call) {
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
