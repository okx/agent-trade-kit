# bot module

[English](./bot.md) | [中文](#bot-模块)

Strategy trading bot tools with sub-module filtering. Requires API key with **Read + Trade** permissions.

## Sub-modules

| Sub-module | Tools | Description |
|------------|-------|-------------|
| `bot.grid` | 9 | Spot Grid, Contract Grid, Moon Grid strategies |
| `bot.dca` | 9 | DCA (Martingale) strategies |
| `bot.smartportfolio` | 8 | Smart Portfolio strategies (auto-rebalancing multi-asset portfolio) |
| `bot.recurring` | 12 (CLI only) | Recurring Buy strategies (periodic fixed-amount buys of a coin basket) |

**Module aliases:**
- `bot` → `bot.grid` only (the default bot sub-module)
- `bot.all` → all bot MCP sub-modules (`bot.grid` + `bot.dca` + `bot.smartportfolio`)
- `bot.recurring` is **CLI-only**: it is not part of `bot` or `bot.all` and is not available through `--modules`

## Grid tools (bot.grid)

| Tool | Description |
|------|-------------|
| `grid_get_orders` | List active or historical grid bots |
| `grid_get_order_details` | Get details of a specific grid bot |
| `grid_get_sub_orders` | List sub-orders (filled or live) within a grid bot |
| `grid_create_order` | Create a new grid bot (spot or contract) |
| `grid_amend_order` | Amend a running grid bot without stopping it (price range and/or TP/SL) |
| `grid_stop_order` | Stop a running grid bot |
| `grid_get_positions` | Get open contract-grid positions (liquidation price, margin ratio, unrealized PnL) |
| `grid_get_liquidate_price` | Estimate liquidation price for a contract-grid bot |
| `grid_close_position` | Close remaining open position after bot stopped with `stopType='2'` |

### Grid strategy types

| `algoOrdType` | Description |
|---------------|-------------|
| `grid` | Spot grid — trades a spot pair within a price range |
| `contract_grid` | Contract grid — trades a perpetual or delivery contract (USDT-margined e.g. BTC-USDT-SWAP, or coin-margined e.g. BTC-USD-SWAP) |
| `moon_grid` | Moon grid — geometric grid optimized for trending markets |

### Important: `algoId` and `algoOrdType` usage

- **`algoId`** is a grid bot algo order ID (returned by `grid_create_order` or `grid_get_orders`). It is **NOT** a normal trade order ID — do not pass `ordId` values here.
- **`algoOrdType`** must match the bot's actual type. Always use the `algoOrdType` value from `grid_get_orders` response — do not guess based on user description alone. Mismatched values will cause error `50016`.

### Contract grid — required `direction`

When creating a contract grid (`algoOrdType=contract_grid`), the `direction` parameter (`long`, `short`, or `neutral`) is **required**. Omitting it will return a validation error.

### Contract grid — `basePos` default

When creating a contract grid, `basePos` (whether to open a base position at creation) defaults to **`true`**. This means long/short direction grids will automatically open a base position. The neutral direction ignores this parameter. Pass `basePos: false` to disable.

## DCA tools (bot.dca)

| Tool | Description |
|------|-------------|
| `dca_create_order` | Create a Contract DCA (Martingale) bot |
| `dca_stop_order` | Stop a running Contract DCA bot |
| `dca_get_orders` | List active or historical Contract DCA bots |
| `dca_get_order_details` | **[Deprecated]** Use `dca_get_positions`. Get position details of a single Contract DCA bot |
| `dca_get_positions` | Get position info (avgPx, upl, liqPx, ...) of a single Contract DCA bot |
| `dca_get_sub_orders` | List cycles / orders within a cycle of a Contract DCA bot |
| `dca_add_margin` | Add margin to a running contract DCA bot |
| `dca_reduce_margin` | Reduce margin on a running contract DCA bot |
| `dca_update_take_profit` | Update take-profit price on a running contract DCA bot |

## Smart Portfolio tools (bot.smartportfolio)

| Tool | Description |
|------|-------------|
| `smart_portfolio_create_order` | Create a Smart Portfolio bot (2–10 assets with ratios summing to 1.0, auto-rebalanced) |
| `smart_portfolio_get_orders` | List running Smart Portfolio bots, or stopped ones with `status='history'` |
| `smart_portfolio_get_order_details` | Get one bot with its current allocation, PnL, rebalance interval and `deltaRatio` |
| `smart_portfolio_stop_order` | Stop a running bot (`stopType` required: `1` sell all assets, `2` keep assets) |
| `smart_portfolio_amend_rebalance` | Change the rebalance parameters (`deltaRatio` and `interval`, both required) |
| `smart_portfolio_instant_rebalance` | Trigger an immediate rebalance (accepted, not necessarily executed) |
| `smart_portfolio_get_recommend_zones` | Browse OKX-recommended Smart Portfolio configurations |
| `smart_portfolio_get_zones_backtest` | Get the backtest result of a recommended zone by `recommendId` |

## Recurring Buy tools (bot.recurring, CLI only)

These are core tool specs behind the `okx bot recurring <sub>` commands. The module is **not** an MCP module, so none of them is exposed over MCP and the MCP tool list is unchanged. See [designs/recurring.md](../designs/recurring.md) and [cli-reference](../cli-reference.md).

| Tool | Description |
|------|-------------|
| `recurring_create_order` | Create a Recurring Buy strategy (periodic fixed-amount buys of a coin basket) |
| `recurring_get_orders` | List running / paused strategies, or stopped ones with `--history` |
| `recurring_get_order_details` | Get one strategy with schedule, per-coin holdings, average price and PnL |
| `recurring_get_sub_orders` | List the buy orders a strategy has executed |
| `recurring_pause` | Pause a running strategy |
| `recurring_restart` | Restart a paused strategy |
| `recurring_stop_order` | Stop a strategy permanently |
| `recurring_amend_name` | Rename a strategy |
| `recurring_amend_price_range` | Change the per-coin price range in which it may buy |
| `recurring_amend_amount` | Change the amount invested per cycle |
| `recurring_amend_time` | Change the schedule (`recurringTimeType=2` buys immediately) |
| `recurring_add_investment` | Add an extra one-off investment (real trade) |

### Important: `tdMode` and `acctLv`

- **`tdMode`** is required on create and has no default. The accepted value depends on the account mode (`acctLv` from `okx account config`): `1` → `cash`; `2` → `cash` or `cross` (`cross` opens a real leveraged position); `3` and `4` → `cross` only. The CLI does not check it against the account; the `okx-cex-bot` skill guides the choice.
- **`algoId`** is the strategy ID returned by create or list. It is **NOT** a normal trade order ID.

## Example prompts

**Grid:**
- "List all my running grid bots"
- "Create a spot grid on BTC-USDT: 100 USDT, 10 grids, range 63000–77000"
- "Create a coin-margined contract grid on BTC-USD-SWAP: long, 5x lever, 0.1 BTC margin, 20 grids, range 80000–100000"
- "Show filled sub-orders for grid bot algoId 12345"
- "Stop my BTC-USDT grid bot and sell all holdings"
- "Show the open positions and liquidation price of contract grid bot algoId 12345"

**DCA:**
- "Create a contract DCA bot on BTC-USDT-SWAP: 3x leverage, long, 100 USDT initial, 3 max safety, 3% TP"
- "Show my active DCA strategies"
- "Stop DCA bot algoId 12345"

**Smart Portfolio:**
- "Create a Smart Portfolio with 60% BTC and 40% ETH, 5000 USDT"
- "Show my running Smart Portfolio bots"
- "Change the rebalance threshold of Smart Portfolio algoId 12345 to 5%"

**Recurring Buy:**
- "Buy 100 USDT of BTC (20%) and ETH (80%) every month on day 1 at 00:00"
- "Show my running Recurring Buy strategies"
- "Change the amount of Recurring Buy strategy algoId 12345 to 20 USDT"
- "Pause Recurring Buy strategy algoId 12345"

## CLI

```bash
# ── Grid ──────────────────────────────────────────────────────────────────────
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history
okx bot grid details --algoOrdType grid --algoId <id>
okx bot grid sub-orders --algoOrdType grid --algoId <id>

okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 --quoteSz 100

# Contract grid (basePos defaults to true — opens base position)
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 \
  --direction long --lever 5 --sz 100

# Contract grid without base position
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 \
  --direction long --lever 5 --sz 100 --no-basePos

# Coin-margined contract grid (sz in BTC, not USDT)
okx bot grid create --instId BTC-USD-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 20 \
  --direction long --lever 5 --sz 0.1

okx bot grid stop --algoId <id> --algoOrdType grid --instId BTC-USDT

# Contract grid positions (liquidation price, margin ratio, unrealized PnL) — contract_grid only
okx bot grid positions --algoId <id> --algoOrdType contract_grid

# Estimate liquidation price before creating a contract grid (full intended config required)
okx bot grid liquidate-price --instId BTC-USDT-SWAP --sz 100 --lever 3 \
  --maxPx 100000 --minPx 80000 --gridNum 10 --direction neutral

# Close the remaining position after stopping with --stopType 2
# (close mode required: --mktClose for market, or --no-mktClose --sz --px for limit)
okx bot grid close-position --algoId <id> --mktClose

# ── Contract DCA ──────────────────────────────────────────────────────────────
okx bot dca orders [--algoId <id>] [--instId <id>]
okx bot dca orders --history
okx bot dca positions --algoId <id>
okx bot dca details --algoId <id>   # deprecated, use `positions`
okx bot dca sub-orders --algoId <id>
okx bot dca sub-orders --algoId <id> --cycleId <cycleId>
okx bot dca sub-orders --algoId <id> [--cycleId <cycleId>] [--after <id>] [--before <id>] [--limit <n>]

okx bot dca create --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 --tpPct 0.03
# Note: safetyOrdAmt, pxSteps, pxStepsMult, volMult are required when maxSafetyOrds > 0

# With optional params (stop-loss, trigger strategy)
okx bot dca create --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.15 --slMode market

okx bot dca stop --algoId <id>

# ── Smart Portfolio ───────────────────────────────────────────────────────────
okx bot smart-portfolio orders [--history] [--algoId <id>]
okx bot smart-portfolio details --algoId <id>
okx bot smart-portfolio recommend-zones [--assetType Crypto]
okx bot smart-portfolio zones-backtest --recommendId <id> [--period 3M]

okx bot smart-portfolio create --stgyName "My Portfolio" --investmentCcy USDT --initCapital 5000 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 --deltaRatio 0.05

okx bot smart-portfolio amend-rebalance --algoId <id> --deltaRatio 0.05 --interval 60
okx bot smart-portfolio instant-rebalance --algoId <id>
okx bot smart-portfolio stop --algoId <id> --stopType 1

# ── Recurring Buy (CLI only) ──────────────────────────────────────────────────
okx bot recurring orders [--history] [--algoId <id>]
okx bot recurring details --algoId <id>
okx bot recurring sub-orders --algoId <id>

# tdMode is required: 1 → cash; 2 → cash or cross (real leverage); 3 and 4 → cross only
okx bot recurring create --stgyName "BTC-ETH monthly" \
  --recurringList '[{"ccy":"BTC","ratio":"0.2"},{"ccy":"ETH","ratio":"0.8"}]' \
  --period monthly --recurringDay 1 --recurringTime 0 --timeZone 8 \
  --amt 100 --investmentCcy USDT --tdMode cash
# Negative time zone: --timeZone=-5

okx bot recurring pause --algoId <id>
okx bot recurring restart --algoId <id>
okx bot recurring stop --algoId <id>
okx bot recurring amend-name --algoId <id> --stgyName <name>
okx bot recurring amend-amount --algoId <id> --amount 20
okx bot recurring add-investment --algoId <id> --amount 20
```

---

# bot 模块

[English](#bot-module) | [中文](./bot.md#bot-模块)

策略交易机器人工具，支持子模块过滤。需要 API Key，开启 **读取 + 交易** 权限。

## 子模块

| 子模块 | 工具数 | 说明 |
|--------|--------|------|
| `bot.grid` | 9 | 现货网格、合约网格、Moon Grid 策略 |
| `bot.dca` | 9 | DCA（马丁格尔）策略 |
| `bot.smartportfolio` | 8 | 智能组合策略（自动再平衡的多资产组合） |
| `bot.recurring` | 12（仅 CLI） | 定投策略（按周期定额买入一篮子币） |

**模块别名：**
- `bot` → 只有 `bot.grid`（默认的 bot 子模块）
- `bot.all` → 所有 bot MCP 子模块（`bot.grid` + `bot.dca` + `bot.smartportfolio`）
- `bot.recurring` 为**仅 CLI** 模块：不属于 `bot` 或 `bot.all`，也不能通过 `--modules` 启用

## 网格工具 (bot.grid)

| 工具 | 说明 |
|------|------|
| `grid_get_orders` | 列出运行中或历史网格机器人 |
| `grid_get_order_details` | 查询指定机器人的详情 |
| `grid_get_sub_orders` | 列出机器人子订单（已成交或挂单） |
| `grid_create_order` | 创建网格机器人（现货或合约） |
| `grid_amend_order` | 修改运行中的网格机器人而不停止（价格区间和/或止盈止损） |
| `grid_stop_order` | 停止运行中的机器人 |
| `grid_get_positions` | 查询合约网格持仓（强平价、保证金率、未实现盈亏） |
| `grid_get_liquidate_price` | 估算合约网格机器人的强平价 |
| `grid_close_position` | 关闭以 `stopType='2'` 停止的机器人的剩余持仓 |

### 网格策略类型

| `algoOrdType` | 说明 |
|---------------|------|
| `grid` | 现货网格——在价格区间内交易现货对 |
| `contract_grid` | 合约网格——交易永续或交割合约（U 本位如 BTC-USDT-SWAP，币本位如 BTC-USD-SWAP） |
| `moon_grid` | Moon Grid——几何级差网格，适合趋势行情 |

### 重要：`algoId` 和 `algoOrdType` 使用说明

- **`algoId`** 是网格机器人的策略订单 ID（由 `grid_create_order` 或 `grid_get_orders` 返回），**不是**普通交易订单 ID——不要传 `ordId` 的值。
- **`algoOrdType`** 必须与机器人的实际类型匹配。务必使用 `grid_get_orders` 返回结果中的 `algoOrdType` 值，不要仅凭用户描述猜测。类型不匹配会导致错误 `50016`。

### 合约网格 — `direction` 必传

创建合约网格（`algoOrdType=contract_grid`）时，`direction` 参数（`long`、`short` 或 `neutral`）为**必填**。缺少时会返回校验错误。

### 合约网格 — `basePos` 默认值

创建合约网格时，`basePos`（是否在创建时开底仓）默认为 **`true`**。即做多/做空方向的网格会自动开底仓。中性方向忽略此参数。传 `basePos: false` 可禁用。

## DCA 工具 (bot.dca)

| 工具 | 说明 |
|------|------|
| `dca_create_order` | 创建合约 DCA（马丁格尔）机器人 |
| `dca_stop_order` | 停止合约 DCA 机器人 |
| `dca_get_orders` | 列出运行中或历史合约 DCA 机器人 |
| `dca_get_order_details` | **[已废弃]** 请使用 `dca_get_positions`。查询单个合约 DCA 机器人持仓详情 |
| `dca_get_positions` | 查询单个合约 DCA 机器人持仓信息（avgPx、upl、liqPx 等） |
| `dca_get_sub_orders` | 列出合约 DCA 周期 / 周期内订单 |
| `dca_add_margin` | 为运行中的合约 DCA 机器人增加保证金 |
| `dca_reduce_margin` | 减少运行中的合约 DCA 机器人的保证金 |
| `dca_update_take_profit` | 更新运行中的合约 DCA 机器人的止盈价 |

## 智能组合工具 (bot.smartportfolio)

| 工具 | 说明 |
|------|------|
| `smart_portfolio_create_order` | 创建智能组合机器人（2 到 10 个资产，比例之和为 1.0，自动再平衡） |
| `smart_portfolio_get_orders` | 列出运行中的智能组合机器人，`status='history'` 列出已停止的 |
| `smart_portfolio_get_order_details` | 查询单个机器人的当前配比、盈亏、再平衡间隔和 `deltaRatio` |
| `smart_portfolio_stop_order` | 停止运行中的机器人（`stopType` 必填：`1` 卖出全部资产，`2` 保留资产） |
| `smart_portfolio_amend_rebalance` | 修改再平衡参数（`deltaRatio` 和 `interval` 均必填） |
| `smart_portfolio_instant_rebalance` | 立即触发一次再平衡（请求被接受，不代表已成交） |
| `smart_portfolio_get_recommend_zones` | 浏览 OKX 推荐的智能组合配置 |
| `smart_portfolio_get_zones_backtest` | 按 `recommendId` 查询推荐配置的回测结果 |

## 定投工具 (bot.recurring，仅 CLI)

以下是 `okx bot recurring <sub>` 命令背后的核心工具定义。该模块**不是** MCP 模块，因此这些工具都不会通过 MCP 暴露，MCP 工具列表保持不变。详见 [designs/recurring.md](../designs/recurring.md) 和 [cli-reference](../cli-reference.md)。

| 工具 | 说明 |
|------|------|
| `recurring_create_order` | 创建定投策略（按周期定额买入一篮子币） |
| `recurring_get_orders` | 列出运行中 / 已暂停的策略，加 `--history` 列出已停止的策略 |
| `recurring_get_order_details` | 查询单个策略的计划、各币种持仓、均价和盈亏 |
| `recurring_get_sub_orders` | 列出策略已执行的买入订单 |
| `recurring_pause` | 暂停运行中的策略 |
| `recurring_restart` | 重新启动已暂停的策略 |
| `recurring_stop_order` | 永久停止策略 |
| `recurring_amend_name` | 修改策略名称 |
| `recurring_amend_price_range` | 修改各币种允许买入的价格区间 |
| `recurring_amend_amount` | 修改每期投入金额 |
| `recurring_amend_time` | 修改定投时间（`recurringTimeType=2` 会立即买入） |
| `recurring_add_investment` | 追加一笔一次性投入（真实交易） |

### 重要：`tdMode` 和 `acctLv`

- **`tdMode`** 创建时必填，没有默认值。可用的取值取决于账户模式（`okx account config` 返回的 `acctLv`）：`1` → `cash`；`2` → `cash` 或 `cross`（`cross` 会开出真实杠杆持仓）；`3` 和 `4` → 只能 `cross`。CLI 不会按账户校验，由 `okx-cex-bot` skill 引导选择。
- **`algoId`** 是创建或列表返回的策略 ID，**不是**普通交易订单 ID。

## 示例提示词

**网格：**
- "列出我所有运行中的网格机器人"
- "在 BTC-USDT 创建现货网格：100 USDT，10 个格，区间 63000–77000"
- "在 BTC-USD-SWAP 创建币本位合约网格：做多，5 倍杠杆，0.1 BTC 保证金，20 个格，区间 80000–100000"
- "显示网格机器人 algoId 12345 的已成交子订单"
- "停止我的 BTC-USDT 网格机器人并卖出所有持仓"
- "查看合约网格机器人 algoId 12345 的当前持仓和强平价"

**DCA：**
- "创建 BTC-USDT-SWAP 合约 DCA 机器人：3 倍杠杆，做多，初始 100 USDT，最多 3 个安全单，3% 止盈"
- "显示我的 DCA 策略"
- "停止 DCA 机器人 algoId 12345"

**智能组合：**
- "创建一个智能组合：60% BTC、40% ETH，投入 5000 USDT"
- "显示我运行中的智能组合机器人"
- "把智能组合 algoId 12345 的再平衡阈值改成 5%"

**定投：**
- "每月 1 号 00:00 定投 100 USDT，BTC 占 20%、ETH 占 80%"
- "显示我运行中的定投策略"
- "把定投策略 algoId 12345 的每期金额改成 20 USDT"
- "暂停定投策略 algoId 12345"

## CLI

```bash
# ── 网格 ──────────────────────────────────────────────────────────────────────
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history
okx bot grid details --algoOrdType grid --algoId <id>
okx bot grid sub-orders --algoOrdType grid --algoId <id>

okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 --quoteSz 100

# 合约网格（basePos 默认 true——自动开底仓）
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 \
  --direction long --lever 5 --sz 100

# 合约网格不开底仓
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 \
  --direction long --lever 5 --sz 100 --no-basePos

# 币本位合约网格（sz 单位为 BTC，非 USDT）
okx bot grid create --instId BTC-USD-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 20 \
  --direction long --lever 5 --sz 0.1

okx bot grid stop --algoId <id> --algoOrdType grid --instId BTC-USDT

# 合约网格持仓（强平价、保证金率、未实现盈亏）— 仅 contract_grid
okx bot grid positions --algoId <id> --algoOrdType contract_grid

# 建仓前估算强平价（需提供完整的目标配置）
okx bot grid liquidate-price --instId BTC-USDT-SWAP --sz 100 --lever 3 \
  --maxPx 100000 --minPx 80000 --gridNum 10 --direction neutral

# 以 --stopType 2 停止后，关闭剩余持仓（平仓方式必填：--mktClose 市价，或 --no-mktClose --sz --px 限价）
okx bot grid close-position --algoId <id> --mktClose

# ── 合约 DCA ──────────────────────────────────────────────────────────────────
okx bot dca orders [--algoId <id>] [--instId <id>]
okx bot dca orders --history
okx bot dca positions --algoId <id>
okx bot dca details --algoId <id>   # deprecated, use `positions`
okx bot dca sub-orders --algoId <id>
okx bot dca sub-orders --algoId <id> --cycleId <cycleId>
okx bot dca sub-orders --algoId <id> [--cycleId <cycleId>] [--after <id>] [--before <id>] [--limit <n>]

okx bot dca create --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 --tpPct 0.03
# 注意：当 maxSafetyOrds > 0 时，safetyOrdAmt、pxSteps、pxStepsMult、volMult 为必填

# 带可选参数（止损、触发策略）
okx bot dca create --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.15 --slMode market

okx bot dca stop --algoId <id>

# ── 智能组合 ──────────────────────────────────────────────────────────────────
okx bot smart-portfolio orders [--history] [--algoId <id>]
okx bot smart-portfolio details --algoId <id>
okx bot smart-portfolio recommend-zones [--assetType Crypto]
okx bot smart-portfolio zones-backtest --recommendId <id> [--period 3M]

okx bot smart-portfolio create --stgyName "My Portfolio" --investmentCcy USDT --initCapital 5000 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 --deltaRatio 0.05

okx bot smart-portfolio amend-rebalance --algoId <id> --deltaRatio 0.05 --interval 60
okx bot smart-portfolio instant-rebalance --algoId <id>
okx bot smart-portfolio stop --algoId <id> --stopType 1

# ── 定投（仅 CLI）──────────────────────────────────────────────────────────────
okx bot recurring orders [--history] [--algoId <id>]
okx bot recurring details --algoId <id>
okx bot recurring sub-orders --algoId <id>

# tdMode 必填：1 → cash；2 → cash 或 cross（真实杠杆）；3 和 4 → 只能 cross
okx bot recurring create --stgyName "BTC-ETH 每月定投" \
  --recurringList '[{"ccy":"BTC","ratio":"0.2"},{"ccy":"ETH","ratio":"0.8"}]' \
  --period monthly --recurringDay 1 --recurringTime 0 --timeZone 8 \
  --amt 100 --investmentCcy USDT --tdMode cash
# 负时区：--timeZone=-5

okx bot recurring pause --algoId <id>
okx bot recurring restart --algoId <id>
okx bot recurring stop --algoId <id>
okx bot recurring amend-name --algoId <id> --stgyName <name>
okx bot recurring amend-amount --algoId <id> --amount 20
okx bot recurring add-investment --algoId <id> --amount 20
```
