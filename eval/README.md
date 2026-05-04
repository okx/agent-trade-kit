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

### Required: EVAL_NONCE pattern

Embed a unique nonce in the prompt and assert the LLM echoed it back. This proves the LLM actually called the tool and used real data — not a cached or hallucinated response.

```typescript
const EVAL_NONCE = 'EVAL_<MODULE>_<N>_<RANDOM>';
const USER_PROMPT = `Do X using the OKX CLI. Include "${EVAL_NONCE}" verbatim in your reply.`;
// ...
const hasNonce = trace.assistantReply.includes(EVAL_NONCE);
status = hasNonce ? 'pass' : 'fail';
```

### Probe skeleton

```typescript
import { describe, it } from 'vitest';
import { runAgent, recordResult, getModels, getRunsPerModel } from '@eval/shared/eval-helpers.js';

const EVAL_NONCE = 'EVAL_MKT_001_A7B2';
const USER_PROMPT = `Get the current BTC-USDT price using the OKX CLI. Include "${EVAL_NONCE}" verbatim in your reply.`;

describe('tier2.market-get-ticker', () => {
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
          evidence.reply_tail = trace.assistantReply.slice(-600);
          const hasNonce = trace.assistantReply.includes(EVAL_NONCE);
          // add tool-specific assertions here
          status = hasNonce ? 'pass' : 'fail';
          if (!hasNonce) failure_reason = 'nonce not found in reply';
        } catch (e: any) {
          failure_reason = e.message;
          evidence.error = e.message;
        }
        recordResult({
          probe_id: 'tier2.market-get-ticker',
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
      }, 200_000);
    }
  }
});
```

## NONCE Naming Convention

| Module | Prefix |
|--------|--------|
| market | `MKT_` |
| spot | `SPOT_` |
| swap | `SWAP_` |
| futures | `FUT_` |
| option | `OPT_` |
| account | `ACC_` |
| event | `EVT_` |
| news | `NEWS_` |
| smartmoney | `SM_` |
| earn.savings | `EARN_SAV_` |
| earn.onchain | `EARN_OC_` |
| earn.dcd | `EARN_DCD_` |
| earn.autoearn | `EARN_AE_` |
| earn.flash | `EARN_FL_` |
| bot.grid | `GRID_` |
| bot.dca | `DCA_` |
| skills | `SMP_` |

## Safety

- Container always runs with `OKX_ENV=demo` and `OKX_DRY_RUN=1`
- Never assert on live account balances or real order IDs
- Write operations (place order, etc.) are dry-run safe
