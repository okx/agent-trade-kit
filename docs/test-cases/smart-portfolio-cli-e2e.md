# Smart Portfolio CLI — E2E 测试用例

## 测试环境准备

```bash
# 使用 demo 账号（模拟盘），避免真实资金风险
okx config init   # 确认已配置 demo profile
export OKX_PROFILE=demo   # 或 --profile demo

# 确认模块已加载
okx --modules bot.smartportfolio --help
```

> **注意**：`bot.smartportfolio` 不在 DEFAULT_MODULES 中，需显式传入 `--modules bot.smartportfolio`
> 或使用 `--modules bot.all` / `--modules all`。

---

## 变量约定

测试过程中通过 `--json` 提取 `algoId` 供后续用例复用：

```bash
ALGO_ID=$(okx bot smart-portfolio orders --json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['algoId'])")
ZONE_ID=$(okx bot smart-portfolio recommend-zones --json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['recommendId'])")
```

---

## TC-01 查询推荐组合（前置，无依赖）

### TC-01-1 查全部推荐组合（默认）

```bash
okx bot smart-portfolio recommend-zones
```

**预期**：
- 输出表格，包含 `recommendId`、`title`、`assetType`、`coinCount`、`deltaRatio`、`interval` 等列
- 至少返回 1 条数据

### TC-01-2 按资产类型过滤

```bash
okx bot smart-portfolio recommend-zones --assetType Crypto
```

**预期**：所有结果的 `assetType` 均为 `Crypto`

### TC-01-3 按 recommendId 查询单个

```bash
okx bot smart-portfolio recommend-zones --recommendId 12
```

**预期**：返回 1 条，`recommendId` 为 12

### TC-01-4 JSON 输出

```bash
okx bot smart-portfolio recommend-zones --json
```

**预期**：输出合法 JSON 数组，每项含 `recommendId`、`stgyParam.portfolioList`、`stgyParam.deltaRatio`、`stgyParam.interval` 字段

---

## TC-02 查询推荐组合回测

### TC-02-1 默认周期回测

```bash
okx bot smart-portfolio zones-backtest --recommendId 12
```

**预期**：
- 输出包含 `recommendId`、`period`、`pnlRatio`、`apy` 的 KV 表
- `period` 值为服务端返回的实际周期（可能与未传 period 时的默认值不同）

### TC-02-2 指定周期

```bash
okx bot smart-portfolio zones-backtest --recommendId 12 --period 1M
okx bot smart-portfolio zones-backtest --recommendId 12 --period 3M
okx bot smart-portfolio zones-backtest --recommendId 12 --period 1Y
```

**预期**：每条命令均成功返回，`period` 字段反映实际返回周期（可能回退）

### TC-02-3 周期大小写不敏感

```bash
okx bot smart-portfolio zones-backtest --recommendId 12 --period 1m
okx bot smart-portfolio zones-backtest --recommendId 12 --period 1M
```

**预期**：两条命令均成功，服务端接受大小写不敏感的 period

### TC-02-4 JSON 输出

```bash
okx bot smart-portfolio zones-backtest --recommendId 12 --period 7D --json
```

**预期**：输出合法 JSON，含 `pnlRatio`、`apy`、`profitHistory` 字段

---

## TC-03 创建策略

### TC-03-1 基础创建（2 币种）

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Test Portfolio" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.05
```

**预期**：
- 输出 `Smart Portfolio created: <algoId> (OK)`
- `algoId` 非空

### TC-03-2 多币种创建（3 币种）

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Multi Coin" \
  --investmentCcy USDT \
  --initCapital 300 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.5"},{"ccy":"ETH","ratio":"0.3"},{"ccy":"SOL","ratio":"0.2"}]' \
  --interval 60 \
  --deltaRatio 0.10
```

**预期**：创建成功，返回 `algoId`

### TC-03-3 CCY 小写自动归一化

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Lowercase CCY" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"btc","ratio":"0.7"},{"ccy":"eth","ratio":"0.3"}]' \
  --interval 20 \
  --deltaRatio 0.05
```

**预期**：创建成功（客户端将 btc/eth 归一化为 BTC/ETH 后发送）

### TC-03-4 可选参数 investType

```bash
okx bot smart-portfolio create \
  --stgyName "E2E InvestType" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.05 \
  --investType simple
```

**预期**：创建成功

### TC-03-5 JSON 输出

```bash
okx bot smart-portfolio create \
  --stgyName "E2E JSON Output" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.05 \
  --json
```

**预期**：输出合法 JSON 数组，含 `algoId`、`sCode: "0"` 字段

### TC-03-6 [异常] portfolioList 少于 2 项

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Error" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"1.0"}]' \
  --interval 20 \
  --deltaRatio 0.05
```

**预期**：输出错误，提示 `portfolioList must have at least 2 items`，退出码非 0

### TC-03-7 [异常] ratio 之和不等于 1

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Error" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.5"},{"ccy":"ETH","ratio":"0.3"}]' \
  --interval 20 \
  --deltaRatio 0.05
```

**预期**：报错 `must sum to 1.0`

### TC-03-8 [异常] 重复 CCY（大小写归一化后）

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Error" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.5"},{"ccy":"btc","ratio":"0.5"}]' \
  --interval 20 \
  --deltaRatio 0.05
```

**预期**：报错 `Duplicate CCY`

### TC-03-9 [异常] deltaRatio 过小（截断后 < 0.01）

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Error" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.009
```

**预期**：报错 `too small`

### TC-03-10 [异常] deltaRatio 边界值截断（0.019 → 0.01，应通过）

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Boundary" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.019
```

**预期**：创建成功（0.019 截断为 0.01，>=0.01 通过校验）

### TC-03-11 [异常] ratio 非数值字符串

```bash
okx bot smart-portfolio create \
  --stgyName "E2E Error" \
  --investmentCcy USDT \
  --initCapital 100 \
  --portfolioList '[{"ccy":"BTC","ratio":"abc"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.05
```

**预期**：报错 `not a valid number`

---

## TC-04 查询运行中策略（依赖 TC-03 创建成功）

### TC-04-1 查全部运行中

```bash
okx bot smart-portfolio orders
```

**预期**：输出表格，至少含 TC-03 创建的策略，`state` 为 `running`

### TC-04-2 按 algoId 过滤

```bash
okx bot smart-portfolio orders --algoId $ALGO_ID
```

**预期**：返回 1 条，`algoId` 匹配

### TC-04-3 按 instId 过滤

```bash
okx bot smart-portfolio orders --instId BTC-USDT
```

**预期**：仅返回包含 BTC-USDT 交易对的策略（可能为空）

### TC-04-4 分页参数

```bash
okx bot smart-portfolio orders --limit 2
okx bot smart-portfolio orders --after $ALGO_ID
okx bot smart-portfolio orders --before $ALGO_ID
```

**预期**：命令不报错，`--limit 2` 最多返回 2 条

### TC-04-5 JSON 输出

```bash
okx bot smart-portfolio orders --json
```

**预期**：合法 JSON 数组，每项含 `algoId`、`stgyName`、`investCcy`、`state` 等字段

---

## TC-05 查询策略详情

### TC-05-1 正常查询

```bash
okx bot smart-portfolio details --algoId $ALGO_ID
```

**预期**：
- 输出 KV 表，含 `algoId`、`state`、`investCcy`、`deltaRatio`、`interval`、`totalPnl`、`pnlRatio`
- `stgyName` 与创建时一致

### TC-05-2 JSON 输出

```bash
okx bot smart-portfolio details --algoId $ALGO_ID --json
```

**预期**：合法 JSON，含完整字段

### TC-05-3 [异常] 不存在的 algoId

```bash
okx bot smart-portfolio details --algoId 000000000000000000
```

**预期**：输出 `Smart Portfolio bot not found`，无错误码抛出

---

## TC-06 修改再平衡参数（依赖运行中策略）

### TC-06-1 修改 deltaRatio

```bash
okx bot smart-portfolio amend-rebalance --algoId $ALGO_ID --deltaRatio 0.08
```

**预期**：输出 `Smart Portfolio rebalance amended: $ALGO_ID (OK)`

### TC-06-2 修改 interval

```bash
okx bot smart-portfolio amend-rebalance --algoId $ALGO_ID --interval 30
```

**预期**：成功

### TC-06-3 同时修改两个参数

```bash
okx bot smart-portfolio amend-rebalance --algoId $ALGO_ID --deltaRatio 0.06 --interval 40
```

**预期**：成功

### TC-06-4 JSON 输出

```bash
okx bot smart-portfolio amend-rebalance --algoId $ALGO_ID --deltaRatio 0.07 --json
```

**预期**：合法 JSON，`data` 为空数组 `[]`

### TC-06-5 [异常] 不传任何可选参数

```bash
okx bot smart-portfolio amend-rebalance --algoId $ALGO_ID
```

**预期**：报错 `at least one of deltaRatio or interval`

---

## TC-07 立即触发再平衡

### TC-07-1 触发再平衡

```bash
okx bot smart-portfolio instant-rebalance --algoId $ALGO_ID
```

**预期**：
- 输出 `Smart Portfolio rebalance triggered: $ALGO_ID (OK)` 或 `not triggered ... already balanced`
- 不报错（triggered=false 也是正常响应）

### TC-07-2 JSON 输出

```bash
okx bot smart-portfolio instant-rebalance --algoId $ALGO_ID --json
```

**预期**：合法 JSON，含 `triggered`（boolean）和 `balanceTime` 字段

---

## TC-08 停止策略

### TC-08-1 停止并卖出（stopType=1）

```bash
okx bot smart-portfolio stop --algoId $ALGO_ID --stopType 1
```

**预期**：
- 输出 `Smart Portfolio stopped: $ALGO_ID (OK)` 或 sCode=0
- 策略状态变为 `stopping` 或 `stopped`

### TC-08-2 停止但保留资产（stopType=2）

> 需另建一个策略（重复 TC-03-1）

```bash
okx bot smart-portfolio stop --algoId $ALGO_ID_2 --stopType 2
```

**预期**：成功，不卖出持仓

### TC-08-3 JSON 输出

```bash
okx bot smart-portfolio stop --algoId $ALGO_ID --stopType 1 --json
```

**预期**：合法 JSON，含 `algoId`、`sCode: "0"`

---

## TC-09 查询历史策略（依赖 TC-08 停止后）

### TC-09-1 查全部历史

```bash
okx bot smart-portfolio history
```

**预期**：含已停止的策略，`state` 为 `stopped`

### TC-09-2 按 state 过滤

```bash
okx bot smart-portfolio history --state stopped
```

**预期**：所有结果 `state=stopped`

### TC-09-3 按 instType 过滤

```bash
okx bot smart-portfolio history --instType SPOT
```

**预期**：命令不报错，返回 SPOT 类型的历史策略

### TC-09-4 按 algoId 过滤

```bash
okx bot smart-portfolio history --algoId $ALGO_ID
```

**预期**：返回该 algoId 的历史记录

### TC-09-5 JSON 输出

```bash
okx bot smart-portfolio history --json
```

**预期**：合法 JSON，含 `algoId`、`state`、`totalPnl` 等字段

---

## 完整生命周期串联测试

按顺序执行以下命令，验证完整流程：

```bash
# 1. 选组合
okx bot smart-portfolio recommend-zones --assetType Crypto --json

# 2. 看回测
okx bot smart-portfolio zones-backtest --recommendId <from step 1> --period 1M --json

# 3. 建仓
okx bot smart-portfolio create \
  --stgyName "E2E Full Lifecycle" \
  --investmentCcy USDT \
  --initCapital 200 \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval 20 \
  --deltaRatio 0.05 \
  --json

# 4. 确认运行
okx bot smart-portfolio orders --json

# 5. 查详情
okx bot smart-portfolio details --algoId <from step 3> --json

# 6. 调参数
okx bot smart-portfolio amend-rebalance --algoId <from step 3> --deltaRatio 0.08

# 7. 手动触发再平衡
okx bot smart-portfolio instant-rebalance --algoId <from step 3> --json

# 8. 停止
okx bot smart-portfolio stop --algoId <from step 3> --stopType 2

# 9. 查历史
okx bot smart-portfolio history --state stopped --json
```

**预期**：每步均成功，无报错，algoId 在步骤 4-9 中均可查到

---

## 测试检查清单

| # | 命令 | 正常路径 | --json 输出 | 异常路径 | 状态 |
|---|------|---------|------------|---------|------|
| TC-01 | recommend-zones | ☐ | ☐ | — | |
| TC-02 | zones-backtest | ☐ | ☐ | — | |
| TC-03 | create | ☐ | ☐ | ☐ (TC-03-6~11) | |
| TC-04 | orders | ☐ | ☐ | — | |
| TC-05 | details | ☐ | ☐ | ☐ (TC-05-3) | |
| TC-06 | amend-rebalance | ☐ | ☐ | ☐ (TC-06-5) | |
| TC-07 | instant-rebalance | ☐ | ☐ | — | |
| TC-08 | stop | ☐ | ☐ | — | |
| TC-09 | history | ☐ | ☐ | — | |
| — | 完整生命周期 | ☐ | — | — | |
