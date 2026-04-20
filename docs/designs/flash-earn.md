# Flash Earn 设计文档

## Business Context

- **目标用户**: 散户——希望参与限时高收益赚币活动的用户
- **业务优先级**: earn 模块功能补全，无硬性 deadline
- **预期调用量**: 低频——闪赚项目有限，用户偶尔浏览即可
- **依赖模块**: 无（独立查询模块，不依赖其他 earn 子模块）
- **风控要求**: 当前仅提供查询功能，无资金变动操作，无特殊风控要求
- **站点支持**: global（⚠️ EEA/US 待确认）
- **API 权限**: Read-only（GET /api/v5/finance/flash-earn/projects）

---

## 模块职责与边界

Flash Earn 作为 **earn 的子模块**（`earn.flash`），新增 1 个 read tool。用于浏览即将开始或进行中的闪赚项目。

职责范围：
- 查询闪赚项目列表，支持按状态筛选（即将开始 / 进行中）

不在范围内：
- 闪赚申购/赎回操作（当前模块仅支持查询，后续如需扩展可新增 write tool）
- 其他 Earn 产品的管理（由 `earn.savings`、`earn.onchain`、`earn.dcd`、`earn.autoearn` 负责）

---

## Tool 清单

| 名称 | Read/Write | 参数 | 说明 |
|------|-----------|------|------|
| `earn_get_flash_earn_projects` | Read | `status` (optional, integer array): 状态筛选，0=即将开始，100=进行中，默认 [0,100] | 查询闪赚项目列表 |

API 映射：`GET /api/v5/finance/flash-earn/projects`

---

## Token 预算评估

| 项目 | 估算 |
|------|------|
| Tool schema（名称 + description + 参数） | ~167 tokens |
| earn 模块变化 | earn 子模块新增 earn.flash（1 tool），与 savings/onchain/dcd/autoearn 并列 |
| 全局变化 | 136 → 137 tools, ~22,892 → ~23,059 tokens |
| 剩余预算 | ~1,941 tokens（上限 25,000） |

新增 1 个 read tool，token 开销极小，不影响预算。

---

## 与现有模块的交互关系

```
earn_get_flash_earn_projects (新增, Read)
  └─ 独立查询，不依赖其他模块
```

不依赖 earn.savings / earn.onchain / earn.dcd / earn.autoearn 模块。

---

## 典型 Workflow

### 场景 1: 浏览所有闪赚项目

```
1. 调用 earn_get_flash_earn_projects() → 默认返回即将开始和进行中的项目
2. 展示项目列表（ID、状态、开始/结束时间、奖励信息）
```

### 场景 2: 查看即将开始的闪赚项目

```
1. 调用 earn_get_flash_earn_projects(status=[0]) → 仅返回即将开始的项目
2. 展示项目列表，告知用户开始时间
```

### 场景 3: 查看进行中的闪赚项目

```
1. 调用 earn_get_flash_earn_projects(status=[100]) → 仅返回进行中的项目
2. 展示项目列表，告知用户是否可申购（canPurchase 字段）
```

