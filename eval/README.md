# Eval Probes

LLM eval probes contributed alongside MRs. The `idea-agent` eval runner picks these up when evaluating a branch.

## Directory Structure

Probes are organized by module, mirroring the tool module structure:

```
eval/probes/
├── market/            # market_get_ticker, market_get_candles, ...
├── spot/              # spot_place_order, spot_cancel_order, ...
├── swap/              # swap_place_order, swap_close_position, ...
├── futures/           # futures_place_order, futures_set_leverage, ...
├── option/            # option_place_order, option_get_greeks, ...
├── account/           # account_get_balance, account_get_positions, ...
├── event/             # event_browse, event_place_order, ...
├── news/              # news_get_latest, news_get_by_coin, ...
├── smartmoney/        # smartmoney_get_traders, smartmoney_get_signal, ...
├── earn/
│   ├── savings/       # earn_savings_purchase, earn_get_savings_balance, ...
│   ├── onchain/       # onchain_earn_purchase, onchain_earn_get_offers, ...
│   ├── dcd/           # dcd_subscribe, dcd_get_products, ...
│   ├── autoearn/      # earn_auto_set
│   └── flash/         # earn_get_flash_earn_projects
├── bot/
│   ├── grid/          # grid_create_order, grid_stop_order, ...
│   └── dca/           # dca_create_order, dca_stop_order, ...
└── skills/            # skills_search, skills_download, ...
```

**Rule**: one probe file per MCP tool. Filename = `tier2-<tool_name>.live.test.ts`.

### Module coverage status

The 17 modules in [`docs/module-registry.md`](../docs/module-registry.md) are
not all probed yet. Current state on `feat/eval-probes-comprehensive`:

| Status | Modules |
|--------|---------|
| ✅ Probed | market, spot, swap, futures, option, account, event, news, smartmoney, skills, bot.grid, bot.dca, earn.savings, earn.onchain, earn.dcd, earn.flash |
| ⏳ Deferred | `earn.autoearn` (placeholder dir only — no probes yet), `earn.fixed` (no dir yet) |

When adding a probe for a deferred module, drop the `.gitkeep` placeholder
and write `tier2-<tool_name>.live.test.ts`. CI gate `eval-probe-check` will
start enforcing the new module once tools under it land.

## How It Works

When the eval runner builds a container for a branch:
1. It clones this repo at the target branch
2. Copies all `eval/probes/**/*.live.test.ts` into the container
3. Runs them together with baseline probes via vitest

Your probe runs against the exact code in your MR.

## Writing a Probe

### Import

All probes import from the `@eval/shared` alias regardless of directory depth:

```typescript
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';
```

### Required: trace-based assertion pattern

Each probe sends an intent-only prompt to the agent, then inspects the
**tool_use blocks the agent emitted** (parsed from
`anthropic-payload.jsonl`, captured by the idea-agent runner) to assert
that the agent invoked the right `okx <module> <subcommand>` with the
right parameters. Tool-call intent + parameters is what we measure;
upstream API auth/401 errors are not the LLM's fault and are not a test
signal.

```typescript
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ['okx', 'market', 'ticker', 'BTC-USDT'],
];
const call = findToolCall(trace, { commandPatterns: EXPECTED_COMMAND_PATTERNS });
status = call ? 'pass' : 'fail';
```

`findToolCall({ commandPatterns })` does **OR-of-AND** substring matching on
each tool's `input.command`: a probe passes if any one pattern's substrings all
appear in any one tool call. Patterns split words to tolerate `--demo` or
`--profile demo` flags inserted between them by the agent.

### Probe skeleton

```typescript
import { describe, it } from 'vitest';
import {
  runAgent, recordResult, getModels, getRunsPerModel,
  findToolCall, summarizeToolCalls,
} from '@eval/shared/eval-helpers.js';

const PROBE_ID = 'tier2.market-get-ticker';
const USER_PROMPT = 'Get the current price of BTC-USDT.';
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ['okx', 'market', 'ticker', 'BTC-USDT'],
  ['okx', 'market', 'tickers'],
];
const EXPECTATION = 'okx market ticker BTC-USDT';

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
          tier: 2,
          llm_model: model,
          attempt,
          status,
          duration_ms: Date.now() - t0,
          evidence,
          failure_reason,
          llm_tokens_in: trace?.tokensIn,
          llm_tokens_out: trace?.tokensOut,
        });
      }, 320_000);
    }
  }
});
```

### Pattern recipes

| Module | Pattern shape | Example |
|--------|---------------|---------|
| market | `['okx', 'market', '<verb>', '<instId>']` | `['okx', 'market', 'ticker', 'BTC-USDT']` |
| spot / swap / futures / option | `['okx', '<module>', '<verb>', '<instId>']` | `['okx', 'spot', 'place', 'BTC-USDT']` |
| account | `['okx', 'account', '<verb>']` | `['okx', 'account', 'positions']` |
| news | `['okx', 'news', '<verb>', ...]` | `['okx', 'news', 'coin-sentiment', 'BTC']` |
| smartmoney | `['okx', 'smartmoney', '<verb>']` | `['okx', 'smartmoney', 'traders']` |
| event | `['okx', 'event', '<verb>']` | `['okx', 'event', 'browse']` |
| earn.* | `['okx', 'earn', '<sub>', '<verb>']` | `['okx', 'earn', 'savings', 'balance']` |
| bot.* | `['okx', 'bot', '<sub>', '<verb>']` | `['okx', 'bot', 'grid', 'orders']` |
| skills | `['okx', 'skill', '<verb>']` | `['okx', 'skill', 'search']` |

For write probes (`*-place-order`), include side / size / instId in
the patterns to catch agents that pick the right tool but wrong direction:

```typescript
const EXPECTED_COMMAND_PATTERNS: string[][] = [
  ['okx', 'spot', 'place', 'BTC-USDT', '--side buy', '--sz 0.001'],
];
```

## Safety

- Container always runs with `OKX_ENV=demo` and `OKX_DRY_RUN=1`
- Never assert on live account balances or real order IDs
- Write operations (place order, etc.) are dry-run safe
