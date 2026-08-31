// eval/probes/futures/tier2-futures-place-order.live.test.ts
// Auto-generated trace-based probe. Asserts that the agent invoked the
// expected `okx` CLI command via the `exec` tool. Tool-call intent +
// parameters is what we measure; upstream API auth/401 errors are not.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

// NOTE: instrument id BTC-USD-YYMMDD is a quarterly delivery contract that
// expires every ~3 months. We let the agent pick any active BTC-USD-YYMMDD
// contract (regex `BTC-USD-\d{6}`); pattern matches the prefix so the probe
// stays valid across roll-forwards. If you need to test a specific expiry,
// override EXPECTED_COMMAND_PATTERNS in your run.
const PROBE_ID = 'tier2.futures-place-order';
// This one passed 3/3 on 2026-08-31 with a weaker prompt, but it was the only
// passing place probe that neither named the subcommand nor required the command
// to be reported — the same gap that sank the option probe. Aligned here.
//
// The four place prompts are still not equal, and the remaining spread is
// deliberate rather than fixed, so record it:
//
//   probe    | names subcmd | report cmd | run-even-if-error | discovery step
//   spot     | yes          | yes        | no                | instId given
//   swap     | yes          | yes        | no                | instId given
//   futures  | yes          | yes        | yes               | market instruments
//   option   | yes          | yes        | yes               | option instruments --uly
//
// spot / swap are left as the unmodified control for the next run: they were
// already 3/3, and if futures or option moves we want to be able to tell a
// template change from run-to-run noise. Revisit once that run lands — either
// backport run-even-if-error to spot / swap, or drop it here.
const USER_PROMPT =
  'Place a limit buy order for 1 contract of a near-month BTC-USD quarterly futures contract ' +
  '(BTC-USD-YYMMDD format) at price 1 in demo/dry-run mode using the okx futures place subcommand. ' +
  'Report the exact command you ran. Even if the command returns an authentication or ' +
  'permission error, still run it once and report it. ' +
  'Skip any auth check — assume credentials are configured. ' +
  'Do NOT run okx auth login or okx config init or okx --help / okx futures --help. ' +
  'You may run okx market instruments once to pick a valid instrument ID.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ["okx", "futures", "place", "BTC-USD-", "buy"],
];
const EXPECTATION = 'okx futures place BTC-USD-<expiry> buy';

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
