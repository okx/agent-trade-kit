# bot module

[English](./bot.md) | [中文](#bot-模块)

Strategy trading bot tools with sub-module filtering. Requires API key with **Read + Trade** permissions.

## Sub-modules

| Sub-module | Tools | Description |
|------------|-------|-------------|
| `bot.grid` | 5 | Spot Grid, Contract Grid, Moon Grid strategies |
| `bot.dca` | 5 | Contract DCA (Martingale) strategies |

**Module aliases:**
- `bot` → all bot sub-modules (`bot.grid` + `bot.dca`)

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

### Contract grid — `basePos` default

When creating a contract grid, `basePos` (whether to open a base position at creation) defaults to **`true`**. This means long/short direction grids will automatically open a base position. The neutral direction ignores this parameter. Pass `basePos: false` to disable.

## DCA tools (bot.dca)

| Tool | Description |
|------|-------------|
| `dca_create_order` | Create a Contract DCA (Martingale) bot |
| `dca_stop_order` | Stop a running Contract DCA bot |
| `dca_get_orders` | List active or historical Contract DCA bots |
| `dca_get_order_details` | Get details of a single Contract DCA bot |
| `dca_get_sub_orders` | List cycles / orders within a cycle of a Contract DCA bot |

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

# ── Contract DCA ──────────────────────────────────────────────────────────────
okx bot dca orders
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

**模块别名：**
- `bot` → 所有 bot 子模块（`bot.grid` + `bot.dca`）

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

### 合约网格 — `basePos` 默认值

创建合约网格时，`basePos`（是否在创建时开底仓）默认为 **`true`**。即做多/做空方向的网格会自动开底仓。中性方向忽略此参数。传 `basePos: false` 可禁用。

## DCA 工具 (bot.dca)

| 工具 | 说明 |
|------|------|
| `dca_create_order` | 创建合约 DCA（马丁格尔）机器人 |
| `dca_stop_order` | 停止合约 DCA 机器人 |
| `dca_get_orders` | 列出运行中或历史合约 DCA 机器人 |
| `dca_get_order_details` | 查询单个合约 DCA 机器人详情 |
| `dca_get_sub_orders` | 列出合约 DCA 周期 / 周期内订单 |

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

# ── 合约 DCA ──────────────────────────────────────────────────────────────────
okx bot dca orders
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
```
