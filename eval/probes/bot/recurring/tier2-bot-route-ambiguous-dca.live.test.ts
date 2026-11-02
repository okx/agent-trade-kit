// eval/probes/bot/recurring/tier2-bot-route-ambiguous-dca.live.test.ts
// Routing probe (not tied to one tool): the request mixes the two products. It says "DCA"
// (the Martingale bot) and describes a periodic fixed amount (Recurring Buy), and it adds
// "buy a bit more when the price drops" (safety-order wording). Creating either bot would
// silently drop part of what the user asked for, so the skill must ask which product is
// meant instead of creating one. See skills/okx-cex-bot/SKILL.md Step 1.
//
// Every recurring-create parameter is supplied (the twin probe
// tier2-bot-route-recurring-implicit uses the same schedule, amount, funding source and
// tdMode), so a missing parameter is never a reason to hold back; the only reason left is
// the product ambiguity. The prompt omits "run the command once" on purpose: nudging the
// agent to execute would defeat the probe. Read-only commands are fine. It also asks for the
// question to be written in the reply as plain text: this harness is headless, so an
// interactive question tool would wait for an answer that never comes.
//
// Verdict:
//   0. An empty reply (the run produced nothing: aborted, timed out) is an `error`, not a
//      routing result, so a harness problem is not counted as a skill failure.
//   1. Any `bot dca create` / `bot recurring create` call fails the probe. A `--help` call on
//      them is read-only, but the helper returns only the first match so we cannot tell whether a
//      real create followed; that is reported as an `error` (inconclusive), never as a pass.
//   2. With no create, the reply must name BOTH alternatives. The prompt contains neither
//      "定投"/"Recurring" nor "马丁"/"Martingale" (it only says "DCA"), so naming both is the
//      agent's own doing.
//   3. The reply must END with a question that offers a choice between the products: a question
//      (or a "please choose" instruction), a choice word such as 还是 / or / 哪个 / which, and a
//      product name, with nothing after it except the listed options. An agent that explains
//      both products and then picks one on its own, or asks and then decides for the user
//      ("你选择定投还是马丁？我已经替你选择定投，稍后执行。"), fails here.
// Layers 2 and 3 read the reply, which the other probes avoid because an upstream 401 can
// distort it. That concern does not apply here: this probe expects no upstream call at all,
// and "asked the user" is only observable in the reply. They are heuristics, not proof:
// the reply tail is recorded so a human can confirm the question really is about the product.
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.bot-route-ambiguous-dca';
const USER_PROMPT = "我想在模拟盘/dry-run 模式下做 DCA：每周一 09:00（UTC+8，时区 8）每次投入 100 USDT 买 BTC，资金来自交易账户（账户是 acctLv 1 的简单模式，tdMode 用 cash）；如果价格跌了，可以多买一点。Skip any auth check — assume credentials are configured. Do NOT run okx auth login or okx config init. If you need to ask me something, write the question in your reply as plain text; do not use any interactive question tool.";
const HELP_FLAG = /(^|\s)(--help|-h)(\s|$)/;
const FORBIDDEN_COMMAND_PATTERNS: string[][] = [
  ["okx", "bot", "dca", "create"],
  ["okx", "bot", "recurring", "create"],
];
// Neither alternative appears in the prompt, so naming them is the agent's own doing.
const RECURRING_MENTION = /定投|recurring/i;
const MARTINGALE_MENTION = /马丁|martingale/i;
// The closing question: one of the last chunks of the reply must be a question (or a "please
// choose" instruction) that itself offers a choice, one of the two alternatives must be named in
// it or in the options listed after it, and NOTHING but those options may follow it. Requiring the
// choice word in the SAME sentence as the question rejects a recommendation that merely ends with
// "确认吗？" and a parameter question such as "USDT 还是 USDC？"; requiring that only options follow
// rejects "asks, then decides for the user". Slightly strict on purpose: a harmless extra sentence
// after the question also fails, and the reply tail is recorded for a human to check.
const QUESTION_MARK = /[?？]/;
const ASK_INSTRUCTION = /请(回复|选择|告诉我)|please (reply|choose|tell me|let me know)/i;
const CHOICE_WORD = /还是|或|哪个|哪种|哪一|选哪|\bor\b|\bwhich\b|\beither\b/i;
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)、])\s*/;
const SENTENCE_END = /(?<=[。！？!?]|\.\s)/;
interface Chunk { text: string; isOption: boolean }
function toChunks(reply: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const line of reply.trim().split(/\n/)) {
    const isOption = LIST_MARKER.test(line);
    const text = line.replace(LIST_MARKER, '').trim();
    if (!text) continue;
    for (const sentence of text.split(SENTENCE_END).map((x) => x.trim()).filter(Boolean)) chunks.push({ text: sentence, isOption });
  }
  return chunks;
}
function endsWithChoiceQuestion(reply: string): boolean {
  const last = toChunks(reply).slice(-8);
  return last.some((c, i) => {
    if (!(QUESTION_MARK.test(c.text) || ASK_INSTRUCTION.test(c.text)) || !CHOICE_WORD.test(c.text)) return false;
    // After the question only the listed options may follow (a bullet or numbered line).
    if (!last.slice(i + 1).every((after) => after.isOption)) return false;
    const fromQuestion = last.slice(i).map((x) => x.text).join(' ');
    return RECURRING_MENTION.test(fromQuestion) || MARTINGALE_MENTION.test(fromQuestion);
  });
}
const EXPECTATION = 'no okx bot dca create / okx bot recurring create; the reply names both 定投/Recurring Buy and 马丁/Martingale and ends with a question asking which one is meant';

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
          evidence.reply_tail = trace.assistantReply.slice(-600);
          evidence.reply_length = trace.assistantReply.length;
          evidence.tokens_out = trace.tokensOut;
          evidence.expected = EXPECTATION;

          const reply = trace.assistantReply;
          const namedBoth = RECURRING_MENTION.test(reply) && MARTINGALE_MENTION.test(reply);
          const asksChoice = endsWithChoiceQuestion(reply);
          evidence.named_both_products = namedBoth;
          evidence.ends_with_choice_question = asksChoice;

          const created = findToolCall(trace, { commandPatterns: FORBIDDEN_COMMAND_PATTERNS });
          if (created) evidence.matched_call = { name: created.name, command: created.input.command };
          if (reply.trim() === '' && !created) {
            // Nothing was produced: the run did not complete. Not a routing result.
            status = 'error';
            failure_reason = 'empty reply: the run produced no output (aborted or timed out), so there is no routing result';
          } else if (created && HELP_FLAG.test(String(created.input.command))) {
            status = 'error';
            failure_reason = 'matched a --help call on a create command; cannot tell whether a real create followed, so the result is inconclusive';
          } else if (created) {
            status = 'fail';
            failure_reason = 'agent created a bot for a request that mixes DCA and Recurring Buy wording instead of asking which product is meant';
          } else if (!namedBoth) {
            status = 'fail';
            failure_reason = 'no bot was created, but the reply does not name both 定投/Recurring Buy and 马丁/Martingale, so it is not asking which product is meant';
          } else if (!asksChoice) {
            status = 'fail';
            failure_reason = 'the reply names both products but does not end with a question asking which one is meant (it may have chosen on its own)';
          } else {
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
