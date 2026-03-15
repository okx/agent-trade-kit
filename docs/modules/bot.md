# bot module

[English](./bot.md) | [中文](#bot-模块)

Strategy trading bot tools with sub-module filtering. Requires API key with **Read + Trade** permissions.

## Sub-modules

| Sub-module | Tools | Description |
|------------|-------|-------------|
| `bot.grid` | 5 | Spot Grid, Contract Grid, Moon Grid strategies |
| `bot.dca` | 5 | Contract DCA (Martingale) strategies |
| `bot.twap` | 4 | TWAP (Time-Weighted Average Price) strategies |

**Module aliases:**
- `bot` → default bot sub-modules only (`bot.grid`)
- `bot.all` → all bot sub-modules (`bot.grid` + `bot.dca` + `bot.twap`)

## Grid tools (bot.grid)

| Tool | Description |
|------|-------------|
| `grid_get_orders` | List active or historical grid bots |
| `grid_get_order_details` | Get details of a specific grid bot |
| `grid_get_sub_orders` | List sub-orders (filled or live) within a grid bot |
| `grid_create_order` | Create a new grid bot (spot or contract) |
| `grid_stop_order` | Stop a running grid bot |

### Grid strategy types

| `algoOrdType` | Description |
|---------------|-------------|
| `grid` | Spot grid — trades a spot pair within a price range |
| `contract_grid` | Contract grid — trades a perpetual or delivery contract |
| `moon_grid` | Moon grid — geometric grid optimized for trending markets |

### Important: `algoId` and `algoOrdType` usage

- **`algoId`** is a grid bot algo order ID (returned by `grid_create_order` or `grid_get_orders`). It is **NOT** a normal trade order ID — do not pass `ordId` values here.
- **`algoOrdType`** must match the bot's actual type. Always use the `algoOrdType` value from `grid_get_orders` response — do not guess based on user description alone. Mismatched values will cause error `50016`.

### Contract grid — `basePos` default

When creating a contract grid, `basePos` (whether to open a base position at creation) defaults to **`true`**. This means long/short direction grids will automatically open a base position. The neutral direction ignores this parameter. Pass `basePos: false` to disable.

### `grid_create_order` — optional parameters

| Parameter | Applies to | Description |
|-----------|------------|-------------|
| `tpTriggerPx` | spot + contract | Take-profit trigger price for the grid bot |
| `slTriggerPx` | spot + contract | Stop-loss trigger price for the grid bot |
| `algoClOrdId` | spot + contract | Client-supplied algo order ID (for idempotency / correlation) |
| `tradeQuoteCcy` | spot only | Quote currency for spot grid profit (e.g. `USDT`) |
| `tpRatio` | contract only | Take-profit ratio (e.g. `0.1` for 10%) |
| `slRatio` | contract only | Stop-loss ratio (e.g. `0.05` for 5%) |

All parameters are optional. Omitting them means the corresponding feature is not enabled.

### Grid extended CLI commands (CLI-only)

The following 14 commands are available only via the CLI. They call the OKX REST API directly and are not exposed as MCP tools.

| Command | Description |
|---------|-------------|
| `bot grid amend-basic` | Amend grid range (minPx/maxPx/gridNum) |
| `bot grid amend-order` | Amend TP/SL or top-up amount on a grid bot |
| `bot grid close-position` | Close the contract grid position (market or limit) |
| `bot grid cancel-close` | Cancel a pending grid close order |
| `bot grid instant-trigger` | Trigger a pending grid bot immediately |
| `bot grid positions` | Query contract grid position details |
| `bot grid withdraw-income` | Withdraw grid arbitrage profit |
| `bot grid compute-margin` | Compute max margin add/reduce for contract grid |
| `bot grid margin-balance` | Add or reduce margin for contract grid |
| `bot grid adjust-investment` | Adjust investment amount for spot grid |
| `bot grid ai-param` | Get AI-recommended grid parameters (public) |
| `bot grid min-investment` | Compute minimum investment for a grid config (public) |
| `bot grid rsi-back-testing` | RSI back-testing for grid trigger conditions (public) |
| `bot grid max-quantity` | Get max grid quantity for a given config (public) |

## DCA tools (bot.dca)

| Tool | Description |
|------|-------------|
| `dca_create_order` | Create a Contract DCA (Martingale) bot |
| `dca_stop_order` | Stop a running Contract DCA bot |
| `dca_get_orders` | List active or historical Contract DCA bots |
| `dca_get_order_details` | Get details of a single Contract DCA bot |
| `dca_get_sub_orders` | List cycles / orders within a cycle of a Contract DCA bot |

## TWAP tools (bot.twap)

| Tool | Description |
|------|-------------|
| `twap_place_order` | Place a TWAP algo order to split a large order over time |
| `twap_cancel_order` | Cancel a running TWAP algo order |
| `twap_get_orders` | List active or historical TWAP algo orders |
| `twap_get_order_details` | Get details of a single TWAP algo order |

### TWAP parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `instId` | Yes | Instrument ID, e.g. BTC-USDT-SWAP |
| `tdMode` | Yes | Trade mode: cross, isolated, cash |
| `side` | Yes | buy or sell |
| `sz` | Yes | Total quantity to execute |
| `szLimit` | Yes | Size limit per slice order |
| `pxLimit` | Yes | Price limit — worst acceptable price |
| `timeInterval` | Yes | Time interval between slices (seconds) |
| `pxVar` | Conditional | Price variance (basis points). Must provide either pxVar or pxSpread |
| `pxSpread` | Conditional | Price spread (absolute). Must provide either pxVar or pxSpread |
| `posSide` | No | Position side for hedge mode: long, short, net |
| `algoClOrdId` | No | Client-assigned algo order ID |
| `ccy` | No | Margin currency, e.g. USDT |
| `tradeQuoteCcy` | No | Quote currency for spot trading. Defaults to instId quote ccy |
| `reduceOnly` | No | Whether to reduce only (true/false) |
| `isTradeBorrowMode` | No | Whether to enable auto-borrow mode (true/false) |

### TWAP cancel / query notes

- `twap_cancel_order` and `twap_get_order_details` accept either `algoId` or `algoClOrdId` (must pass one; `algoId` takes priority if both provided)
- `twap_get_orders` supports `instType` filter (SPOT, SWAP, FUTURES, MARGIN)
- For history queries: `state` and `algoId` are mutually exclusive — pass one or the other (defaults to `state=effective` if neither given)
- TWAP orders cannot be amended — cancel and re-create instead

## Example prompts

**Grid:**
- "List all my running grid bots"
- "Create a spot grid on BTC-USDT: 100 USDT, 10 grids, range 63000–77000"
- "Show filled sub-orders for grid bot algoId 12345"
- "Stop my BTC-USDT grid bot and sell all holdings"

**DCA:**
- "Create a contract DCA bot on BTC-USDT-SWAP: 3x leverage, long, 100 USDT initial, 3 max safety, 3% TP"
- "Show my active DCA strategies"
- "Stop DCA bot algoId 12345"

**TWAP:**
- "Place a TWAP buy order on BTC-USDT-SWAP: 100 contracts, 10 per slice, every 10 seconds, limit price 50000"
- "Show my active TWAP orders"
- "Cancel TWAP order algoId 12345"

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

okx bot grid stop --algoId <id> --algoOrdType grid --instId BTC-USDT --stopType 2

# ── Grid create with optional params ──────────────────────────────────────────
# Spot grid with TP/SL and client order ID
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 --quoteSz 100 \
  --tpTriggerPx 80000 --slTriggerPx 60000 --algoClOrdId mygrid001

# Contract grid with TP/SL ratios
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 \
  --direction long --lever 5 --sz 100 \
  --tpRatio 0.1 --slRatio 0.05

# ── Grid extended commands (CLI-only) ─────────────────────────────────────────
okx bot grid amend-basic --algoId <id> --minPx 62000 --maxPx 78000 --gridNum 12
okx bot grid amend-order --algoId <id> --instId BTC-USDT --tpTriggerPx 80000
okx bot grid close-position --algoId <id> --mktClose
okx bot grid cancel-close --algoId <id> --ordId <ordId>
okx bot grid instant-trigger --algoId <id>
okx bot grid positions --algoOrdType contract_grid --algoId <id>
okx bot grid withdraw-income --algoId <id>
okx bot grid compute-margin --algoId <id> --gridType add
okx bot grid margin-balance --algoId <id> --gridType add --amt 50
okx bot grid adjust-investment --algoId <id> --amt 200
okx bot grid ai-param --algoOrdType grid --instId BTC-USDT
okx bot grid min-investment --instId BTC-USDT --algoOrdType grid \
  --gridNum 10 --maxPx 77000 --minPx 63000 --runType 1
okx bot grid rsi-back-testing --instId BTC-USDT --timeframe 15m --thold 30 --timePeriod 14
okx bot grid max-quantity --instId BTC-USDT --algoOrdType grid \
  --maxPx 77000 --minPx 63000 --runType 1

# ── Contract DCA ──────────────────────────────────────────────────────────────
okx bot dca orders [--algoId <id>] [--instId <id>]
okx bot dca orders --history
okx bot dca details --algoId <id>
okx bot dca sub-orders --algoId <id>
okx bot dca sub-orders --algoId <id> --cycleId <cycleId>

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

# ── TWAP ─────────────────────────────────────────────────────────────────────
okx bot twap orders
okx bot twap orders --history
okx bot twap orders --history --state canceled
okx bot twap orders --instType SWAP
okx bot twap details --algoId <id>
okx bot twap details --algoClOrdId <clientId>

# SWAP (perpetual) — with pxVar
okx bot twap place --instId BTC-USDT-SWAP --tdMode cross --side buy \
  --sz 100 --szLimit 10 --pxLimit 50000 --timeInterval 10 --pxVar 0.005

# SWAP — with pxSpread
okx bot twap place --instId BTC-USDT-SWAP --tdMode cross --side buy \
  --sz 100 --szLimit 10 --pxLimit 50000 --timeInterval 10 --pxSpread 1

# SPOT (现货)
okx bot twap place --instId BTC-USDT --tdMode cash --side buy \
  --sz 0.001 --szLimit 0.0001 --pxLimit 50000 --timeInterval 10 --pxVar 0.005

# MARGIN (杠杆)
okx bot twap place --instId BTC-USDT --tdMode cross --side buy \
  --sz 0.001 --szLimit 0.0001 --pxLimit 50000 --timeInterval 10 --pxVar 0.005

# With reduce-only and auto-borrow
okx bot twap place --instId BTC-USDT-SWAP --tdMode cross --side buy \
  --sz 100 --szLimit 10 --pxLimit 50000 --timeInterval 10 --pxVar 0.005 --reduceOnly --isTradeBorrowMode

okx bot twap cancel --instId BTC-USDT-SWAP --algoId <id>
okx bot twap cancel --instId BTC-USDT-SWAP --algoClOrdId <clientId>
```

---

# bot 模块

[English](#bot-module) | [中文](./bot.md#bot-模块)

策略交易机器人工具，支持子模块过滤。需要 API Key，开启 **读取 + 交易** 权限。

## 子模块

| 子模块 | 工具数 | 说明 |
|--------|--------|------|
| `bot.grid` | 5 | 现货网格、合约网格、Moon Grid 策略 |
| `bot.dca` | 5 | 合约 DCA（马丁格尔）策略 |
| `bot.twap` | 4 | TWAP（时间加权平均价格）策略 |

**模块别名：**
- `bot` → 仅默认 bot 子模块（`bot.grid`）
- `bot.all` → 所有 bot 子模块（`bot.grid` + `bot.dca` + `bot.twap`）

## 网格工具 (bot.grid)

| 工具 | 说明 |
|------|------|
| `grid_get_orders` | 列出运行中或历史网格机器人 |
| `grid_get_order_details` | 查询指定机器人的详情 |
| `grid_get_sub_orders` | 列出机器人子订单（已成交或挂单） |
| `grid_create_order` | 创建网格机器人（现货或合约） |
| `grid_stop_order` | 停止运行中的机器人 |

### 网格策略类型

| `algoOrdType` | 说明 |
|---------------|------|
| `grid` | 现货网格——在价格区间内交易现货对 |
| `contract_grid` | 合约网格——交易永续或交割合约 |
| `moon_grid` | Moon Grid——几何级差网格，适合趋势行情 |

### 重要：`algoId` 和 `algoOrdType` 使用说明

- **`algoId`** 是网格机器人的策略订单 ID（由 `grid_create_order` 或 `grid_get_orders` 返回），**不是**普通交易订单 ID——不要传 `ordId` 的值。
- **`algoOrdType`** 必须与机器人的实际类型匹配。务必使用 `grid_get_orders` 返回结果中的 `algoOrdType` 值，不要仅凭用户描述猜测。类型不匹配会导致错误 `50016`。

### 合约网格 — `basePos` 默认值

创建合约网格时，`basePos`（是否在创建时开底仓）默认为 **`true`**。即做多/做空方向的网格会自动开底仓。中性方向忽略此参数。传 `basePos: false` 可禁用。

### `grid_create_order` — 可选参数

| 参数 | 适用类型 | 说明 |
|------|----------|------|
| `tpTriggerPx` | 现货 + 合约 | 网格机器人止盈触发价 |
| `slTriggerPx` | 现货 + 合约 | 网格机器人止损触发价 |
| `algoClOrdId` | 现货 + 合约 | 客户端策略订单 ID（用于幂等/关联） |
| `tradeQuoteCcy` | 仅现货 | 现货网格交易利润的计价货币（如 `USDT`） |
| `tpRatio` | 仅合约 | 止盈比例（如 `0.1` 表示 10%） |
| `slRatio` | 仅合约 | 止损比例（如 `0.05` 表示 5%） |

所有参数均为可选，不传表示不启用对应功能。

### 网格扩展 CLI 命令（仅 CLI）

以下 14 个命令仅通过 CLI 使用，直接调用 OKX REST API，不作为 MCP 工具暴露。

| 命令 | 说明 |
|------|------|
| `bot grid amend-basic` | 修改网格区间（minPx/maxPx/gridNum） |
| `bot grid amend-order` | 修改网格机器人的止盈止损或追加投入 |
| `bot grid close-position` | 平仓合约网格持仓（市价或限价） |
| `bot grid cancel-close` | 取消待成交的网格平仓订单 |
| `bot grid instant-trigger` | 立即触发待启动的网格机器人 |
| `bot grid positions` | 查询合约网格持仓详情 |
| `bot grid withdraw-income` | 提取网格套利利润 |
| `bot grid compute-margin` | 计算合约网格最大可追加/减少保证金 |
| `bot grid margin-balance` | 追加或减少合约网格保证金 |
| `bot grid adjust-investment` | 调整现货网格投入金额 |
| `bot grid ai-param` | 获取 AI 推荐网格参数（公开接口） |
| `bot grid min-investment` | 计算网格配置的最低投入金额（公开接口） |
| `bot grid rsi-back-testing` | RSI 回测网格触发条件（公开接口） |
| `bot grid max-quantity` | 获取指定配置的最大网格数量（公开接口） |

## DCA 工具 (bot.dca)

| 工具 | 说明 |
|------|------|
| `dca_create_order` | 创建合约 DCA（马丁格尔）机器人 |
| `dca_stop_order` | 停止合约 DCA 机器人 |
| `dca_get_orders` | 列出运行中或历史合约 DCA 机器人 |
| `dca_get_order_details` | 查询单个合约 DCA 机器人详情 |
| `dca_get_sub_orders` | 列出合约 DCA 周期 / 周期内订单 |

## TWAP 工具 (bot.twap)

| 工具 | 说明 |
|------|------|
| `twap_place_order` | 下达 TWAP 算法委托，按时间分片执行大单 |
| `twap_cancel_order` | 取消运行中的 TWAP 委托 |
| `twap_get_orders` | 列出运行中或历史 TWAP 委托 |
| `twap_get_order_details` | 查询单个 TWAP 委托详情 |

### TWAP 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `instId` | 是 | 产品ID，如 BTC-USDT-SWAP |
| `tdMode` | 是 | 交易模式：cross、isolated、cash |
| `side` | 是 | 买卖方向：buy 或 sell |
| `sz` | 是 | 总委托数量 |
| `szLimit` | 是 | 单笔小单数量 |
| `pxLimit` | 是 | 吃单限制价 |
| `timeInterval` | 是 | 下单间隔（秒） |
| `pxVar` | 条件必填 | 吃单价优于盘口的比例，与 pxSpread 二选一必填 |
| `pxSpread` | 条件必填 | 吃单价优于盘口的价距，与 pxVar 二选一必填 |
| `posSide` | 否 | 持仓方向（开平仓模式）：long、short、net |
| `algoClOrdId` | 否 | 客户自定义策略订单ID |
| `ccy` | 否 | 保证金币种，如 USDT |
| `tradeQuoteCcy` | 否 | 币币交易的计价币种，默认为 instId 的计价币 |
| `reduceOnly` | 否 | 是否只减仓（true/false） |
| `isTradeBorrowMode` | 否 | 是否自动借币（true/false） |

### TWAP 撤单 / 查询说明

- `twap_cancel_order` 和 `twap_get_order_details` 支持 `algoId` 或 `algoClOrdId`（必传其一，同时传以 `algoId` 为主）
- `twap_get_orders` 支持 `instType` 过滤（SPOT、SWAP、FUTURES、MARGIN）
- 历史查询：`state` 和 `algoId` 互斥——传其一即可（都不传时默认 `state=effective`）
- TWAP 委托不支持修改——需撤销后重新下单

## 示例提示词

**网格：**
- "列出我所有运行中的网格机器人"
- "在 BTC-USDT 创建现货网格：100 USDT，10 个格，区间 63000–77000"
- "显示网格机器人 algoId 12345 的已成交子订单"
- "停止我的 BTC-USDT 网格机器人并卖出所有持仓"

**DCA：**
- "创建 BTC-USDT-SWAP 合约 DCA 机器人：3 倍杠杆，做多，初始 100 USDT，最多 3 个安全单，3% 止盈"
- "显示我的 DCA 策略"
- "停止 DCA 机器人 algoId 12345"

**TWAP：**
- "在 BTC-USDT-SWAP 下达 TWAP 买单：总量 100 张，每次 10 张，每 10 秒一次，限价 50000"
- "显示我的 TWAP 委托"
- "取消 TWAP 委托 algoId 12345"

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

okx bot grid stop --algoId <id> --algoOrdType grid --instId BTC-USDT --stopType 2

# ── 网格创建含可选参数 ──────────────────────────────────────────────────────────
# 现货网格附带止盈止损和客户端订单 ID
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 --quoteSz 100 \
  --tpTriggerPx 80000 --slTriggerPx 60000 --algoClOrdId mygrid001

# 合约网格附带止盈止损比例
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 77000 --minPx 63000 --gridNum 10 \
  --direction long --lever 5 --sz 100 \
  --tpRatio 0.1 --slRatio 0.05

# ── 网格扩展命令（仅 CLI）─────────────────────────────────────────────────────
okx bot grid amend-basic --algoId <id> --minPx 62000 --maxPx 78000 --gridNum 12
okx bot grid amend-order --algoId <id> --instId BTC-USDT --tpTriggerPx 80000
okx bot grid close-position --algoId <id> --mktClose
okx bot grid cancel-close --algoId <id> --ordId <ordId>
okx bot grid instant-trigger --algoId <id>
okx bot grid positions --algoOrdType contract_grid --algoId <id>
okx bot grid withdraw-income --algoId <id>
okx bot grid compute-margin --algoId <id> --gridType add
okx bot grid margin-balance --algoId <id> --gridType add --amt 50
okx bot grid adjust-investment --algoId <id> --amt 200
okx bot grid ai-param --algoOrdType grid --instId BTC-USDT
okx bot grid min-investment --instId BTC-USDT --algoOrdType grid \
  --gridNum 10 --maxPx 77000 --minPx 63000 --runType 1
okx bot grid rsi-back-testing --instId BTC-USDT --timeframe 15m --thold 30 --timePeriod 14
okx bot grid max-quantity --instId BTC-USDT --algoOrdType grid \
  --maxPx 77000 --minPx 63000 --runType 1

# ── 合约 DCA ──────────────────────────────────────────────────────────────────
okx bot dca orders [--algoId <id>] [--instId <id>]
okx bot dca orders --history
okx bot dca details --algoId <id>
okx bot dca sub-orders --algoId <id>
okx bot dca sub-orders --algoId <id> --cycleId <cycleId>

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

# ── TWAP ─────────────────────────────────────────────────────────────────────
okx bot twap orders
okx bot twap orders --history
okx bot twap orders --history --state canceled
okx bot twap orders --instType SWAP
okx bot twap details --algoId <id>
okx bot twap details --algoClOrdId <clientId>

# 永续合约 — 带 pxVar
okx bot twap place --instId BTC-USDT-SWAP --tdMode cross --side buy \
  --sz 100 --szLimit 10 --pxLimit 50000 --timeInterval 10 --pxVar 0.005

# 永续合约 — 带 pxSpread
okx bot twap place --instId BTC-USDT-SWAP --tdMode cross --side buy \
  --sz 100 --szLimit 10 --pxLimit 50000 --timeInterval 10 --pxSpread 1

# 现货（SPOT）
okx bot twap place --instId BTC-USDT --tdMode cash --side buy \
  --sz 0.001 --szLimit 0.0001 --pxLimit 50000 --timeInterval 10 --pxVar 0.005

# 杠杆（MARGIN）
okx bot twap place --instId BTC-USDT --tdMode cross --side buy \
  --sz 0.001 --szLimit 0.0001 --pxLimit 50000 --timeInterval 10 --pxVar 0.005

okx bot twap cancel --instId BTC-USDT-SWAP --algoId <id>
okx bot twap cancel --instId BTC-USDT-SWAP --algoClOrdId <clientId>
```
