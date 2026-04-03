# Auto-Earn 设计文档

## Business Context

- **目标用户**: 散户、量化团队——希望交易账户闲置资产自动生息的用户
- **业务优先级**: earn 模块功能补全，无硬性 deadline
- **预期调用量**: 低频——账户配置类操作，用户设置一次后很少变动；status 查询复用已有 `account_get_balance`
- **依赖模块**: account（复用 `account_get_balance` 查询余额及 AutoEarn 支持状态）
- **风控要求**: OKX API 硬限制——开启后 24 小时内不可关闭；无大额确认或单日限额
- **站点支持**: global（⚠️ EEA/US 待确认）
- **API 权限**: 查询状态 Read-only（GET /api/v5/account/balance）；开启/关闭需 Trade 权限（POST /api/v5/account/set-auto-earn）

---

## 模块职责与边界

AutoEarn 作为 **earn 的子模块**（`earn.autoearn`），新增 1 个 write tool。虽然 API 路径在 `/api/v5/account/` 下，但从业务语义上属于赚币功能，与 `earn.savings`、`earn.onchain`、`earn.dcd` 并列。

职责范围：
- 开启/关闭指定币种的自动赚币（auto-lend+stake 或 USDG earn）

不在范围内：
- 查询余额/AutoEarn 状态（已由 `account_get_balance` 覆盖）
- Earn 产品的申购/赎回（由 `earn.savings`、`earn.onchain`、`earn.dcd` 负责）

---

## Tool 清单

| 名称 | Read/Write | 参数 | 说明 |
|------|-----------|------|------|
| `earn_auto_set` | Write | `ccy` (required, string): 币种，如 SOL、USDG | 开启或关闭指定币种的自动赚币 |
| | | `action` (required, string): turn_on 或 turn_off | |
| | | `earnType` (optional, string): "0"=auto-lend+stake（默认），"1"=USDG earn | |

API 映射：`POST /api/v5/account/set-auto-earn`

---

## Token 预算评估

| 项目 | 估算 |
|------|------|
| Tool schema（名称 + description + 参数） | ~130 tokens |
| earn 模块变化 | earn 子模块新增 earn.autoearn（1 tool），与 savings/onchain/dcd 并列 |
| 全局变化 | 127 → 128 tools, ~21,600 → ~21,730 tokens |
| 剩余预算 | ~3,270 tokens（上限 25,000） |

新增 1 个 tool，token 开销极小，不影响预算。

---

## 与现有模块的交互关系

```
account_get_balance (已有, Read)
  │
  ├─ 返回 autoLendStatus / autoStakingStatus → 判断币种是否支持 AutoEarn
  ├─ 返回 autoLendAmt / autoLendMtAmt → 查看已匹配赚币资产
  └─ 返回 eq → USDG earn 类型的在投金额
  │
  ▼
earn_auto_set (新增, Write)
  └─ 根据余额信息决定 earnType，调用 set-auto-earn API
```

不依赖 earn.savings / earn.onchain / earn.dcd 模块。

---

## 典型 Workflow

### 场景 1: 查询 AutoEarn 状态

```
1. 调用 account_get_balance → 获取所有币种余额
2. 从返回中筛选 autoLendStatus/autoStakingStatus != "unsupported" 或 USDG earn 币种
3. 展示支持 AutoEarn 的币种列表及当前状态
```

### 场景 2: 开启自动赚币

```
1. 调用 account_get_balance(ccy=SOL) → 确认币种支持 AutoEarn
2. 根据 autoLendStatus/autoStakingStatus 推断 earnType（"0" 或 "1"）
3. 调用 earn_auto_set(ccy=SOL, action=turn_on, earnType=0)
4. 调用 account_get_balance(ccy=SOL) → 确认状态变更
```

### 场景 3: 关闭自动赚币

```
1. 调用 earn_auto_set(ccy=SOL, action=turn_off, earnType=0)
2. 如返回 24 小时限制错误，告知用户等待时间
3. 成功后调用 account_get_balance(ccy=SOL) → 确认状态变更
```
