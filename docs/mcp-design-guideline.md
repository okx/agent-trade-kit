# MCP Tool Design Guideline

本文档是 okx-trade-mcp 新增 MCP 模块/工具的设计规范。Architect 出方案、Developer 实现、Reviewer 审核均以此为准。

---

## 1. 模块接入流程

新业务接入 MCP **必须**按以下步骤进行，跳过任何一步的 MR 将被打回。

### Step 0: 业务对齐（Architect + Product）

在写设计文档之前，Architect 必须先与 MCP 产品方对齐以下业务信息，并将结论写入设计文档的 **Business Context** 章节：

| 对齐项 | 说明 | 示例 |
|--------|------|------|
| **目标用户** | 这个模块面向谁？ | 散户、机构、做市商、量化团队 |
| **业务优先级** | 为什么现在要做？有没有 deadline？ | Q2 重点项目，4月底前上线 |
| **预期调用量** | 高频还是低频？影响是否进默认模块列表 | 高频（日均 10k+ 调用）→ 考虑加入默认模块 |
| **依赖关系** | 需要哪些前置模块配合？ | bot.dca 依赖 market 查行情、account 查余额 |
| **风控要求** | 有没有特殊的确认/限制？ | 大额操作需二次确认、单日限额、IP 白名单 |
| **站点支持范围** | global / EEA / US 哪些站点可用？ | 仅 global + EEA，US 不支持 |
| **API 权限要求** | 需要什么级别的 API key 权限？ | 需要 Trade 权限；仅查询功能需要 Read-only |

**未完成业务对齐的模块不得进入设计阶段。**

设计文档中的 Business Context 模板：

```markdown
## Business Context

- **目标用户**: [填写]
- **业务优先级**: [填写优先级和原因，如有 deadline 标注绝对日期]
- **预期调用量**: [高频/中频/低频，附估算依据]
- **依赖模块**: [列出依赖的现有模块，如无填"无"]
- **风控要求**: [列出特殊限制，如无填"无特殊要求"]
- **站点支持**: [global / eea / us，不支持的标注原因]
- **API 权限**: [Read-only / Trade / Withdraw 等]
```

### Step 1: 提出方案（Architect）

提交一个**仅包含文档**的 MR：

1. 在 `docs/module-registry.md` 中新增一行，status 设为 `📝 proposed`
2. 在 `docs/designs/` 下新增设计文档，内容包括：
   - **Business Context**（Step 0 的对齐结论）
   - 模块职责与边界
   - Tool 清单（名称、read/write、参数列表）
   - Token 预算评估（参考 [Section 4](#4-token-预算管控)）
   - 与现有模块的交互关系
   - 典型 workflow（先查什么 → 再做什么 → 最后确认什么）

### Step 2: 方案审批（TL）

- TL review 并 approve 方案 MR
- Merge 后，registry status 仍为 `📝 proposed`

### Step 3: 实现（Developer）

- 基于已批准的设计文档开发
- 实现 MR 中必须将 registry status 更新为 `✅ approved`
- 在**同一 MR** 中更新 `skills/` 目录下对应的 SKILL.md 及 references/（新增工具必填；修改工具按影响范围更新）

### Step 4: 实现审核（Reviewer）

- 对照 design doc 检查实现是否一致
- 按 [Reviewer Checklist](#6-reviewer-checklist) 逐条检查

---

## 2. Module 设计规范

### 2.1 Module ID 命名

- 顶层模块：单个单词，如 `market`、`spot`、`swap`
- 子模块：`{parent}.{child}`，如 `bot.grid`、`earn.savings`
- 新增顶层模块需要充分理由（增加用户配置复杂度），优先考虑作为现有模块的子模块

### 2.2 模块粒度

- 每个模块对应一个**独立的业务域**，有清晰的边界
- 一个模块的 MCP tool 数量控制在 **5–8 个**（覆盖核心 CRUD + 查询）
- 如果一个模块需要 >12 个 tool，考虑拆分为子模块
- 低频/管理操作可以 CLI-only，但必须在相关 tool description 中提示

### 2.3 默认启用策略

- 新模块默认**不加入** `DEFAULT_MODULES`，需用户显式启用
- 只有用户量大、使用频率高的模块才考虑加入默认列表
- 在 `constants.ts` 的 `MODULES` 数组中注册，支持 `--modules` 选择

---

## 3. Tool 设计规范

### 3.1 命名规范

格式：`{module}_{action}_{object?}`，全小写 snake_case。

| 动作 | 含义 | 示例 |
|------|------|------|
| `place` | 下单 | `spot_place_order` |
| `cancel` | 取消 | `swap_cancel_order` |
| `amend` | 修改 | `futures_amend_order` |
| `get` | 查询单个/列表 | `account_get_balance` |
| `set` | 设置配置 | `swap_set_leverage` |
| `create` | 创建策略/Bot | `grid_create_order` |
| `stop` | 停止策略/Bot | `dca_stop_order` |
| `batch` | 批量操作 | `spot_batch_orders` |
| `close` | 平仓 | `swap_close_position` |

- 不要用 `list` / `fetch` / `query`，统一用 `get`
- 同一模块内的 tool 命名要对称（有 `place` 就要有 `cancel`、`get`）

### 3.2 Description 规范

Description 是 AI agent 选择工具的**唯一依据**，必须回答两个问题：
1. **这个工具做什么？**
2. **什么场景下用？**

```
✅ "Get open positions for perpetual swap contracts. Use this to check P&L, margin, and liquidation price."
❌ "Query /api/v5/account/positions with instType=SWAP, returns posId, pos, avgPx..."
```

**规则：**
- 第一句话是功能摘要，不超过 20 个单词
- 可以加第二句补充使用场景或与其他 tool 的关系
- 不要在 description 中写 API 路径、参数约束、错误码
- API 约束放在参数的 `description` 字段或 handler 的 error message 中

### 3.3 参数设计

**核心原则：参数必须扁平化。** AI 不应构造 JSON 字符串。

```typescript
// ✅ Good — flat parameters
inputSchema: {
  type: "object",
  properties: {
    ccy: { type: "string", description: "Currency, e.g. BTC" },
    amt: { type: "string", description: "Amount to purchase" },
  },
  required: ["ccy", "amt"],
}

// ❌ Bad — AI must construct JSON
inputSchema: {
  type: "object",
  properties: {
    body: { type: "string", description: "JSON string: {\"ccy\":\"BTC\",\"amt\":\"100\"}" },
  },
}
```

**参数规则：**
- 类型只用 `string`、`number`、`boolean`（MCP 协议限制）
- 金额、价格用 `string`（避免浮点精度问题）
- 枚举值在 `description` 中列出，如 `"Side: buy or sell"`
- 多值参数用逗号分隔字符串：`"ccy": "BTC,ETH"`，handler 内部 split
- `required` 只标必填参数，可选参数不要放进去
- 参数命名与 OKX API 字段名保持一致（`instId` 而非 `instrumentId`），降低认知负担

### 3.4 isWrite 标注

| isWrite | 适用场景 | MCP Annotations |
|---------|---------|-----------------|
| `false` | 查询、获取数据 | readOnlyHint=true, destructiveHint=false |
| `true` | 下单、取消、修改、转账 | readOnlyHint=false, destructiveHint=true |

- 涉及资金变动的操作**必须**标为 `isWrite: true`
- `read-only` 模式下 write tool 会被自动过滤

### 3.5 Handler 实现

```typescript
handler: async (args, context) => {
  // 1. 参数提取与校验 — 使用 requireString / readString 等 helper
  const instId = requireString(args, "instId");
  const side = requireString(args, "side");
  const sz = requireString(args, "sz");

  // 2. 组装 API 请求体 — 嵌套 JSON 在这里构建
  const body = compactObject({ instId, side, sz, tdMode: "cash" });

  // 3. 调用 OKX API
  const res = await context.client.post("/api/v5/trade/order", body);

  // 4. 返回标准化结果
  return normalizeResponse(res, "/api/v5/trade/order");
}
```

**规则：**
- 不要在 handler 中硬编码 site URL，使用 `context.client`
- 错误信息要对 AI 友好，包含 suggestion（下一步该做什么）
- handler 内部的参数校验失败应抛出明确的错误，而非透传 API 的模糊错误

### 3.6 幂等性

- 所有 `get` 操作必须幂等
- `cancel` 操作应幂等（重复取消同一订单不报错）
- `place` / `create` 操作天然非幂等，handler 中不要做重复检测

---

## 4. Token 预算管控

### 4.1 当前状态

全量 tool schema（所有模块启用时）的 token 预算上限为 **25,000 tokens**。

Token 占比分布：
- JSON 结构开销：~48%
- Description 文本：~40%
- Tool/参数名称：~8%
- 其他：~4%

### 4.2 估算方法

新增一个 tool 的 token 开销约 **150–250 tokens**，取决于参数数量和 description 长度。

粗估公式：
```
tokens ≈ 80(基础) + 15 × 参数数量 + description字符数 / 4
```

### 4.3 超预算策略

当总 token 接近或超过 25,000 时，按优先级执行：

1. **压缩 description** — 删除冗余描述，合并相似说明
2. **合并 tool** — 将功能相近的 tool 合并（如 `get_order` + `get_orders` → 一个 tool 带可选 `ordId` 参数）
3. **降级到 CLI-only** — 低频操作从 MCP 移除，仅保留 CLI
4. **调整默认模块** — 将低频模块移出 `DEFAULT_MODULES`，按需加载

### 4.4 模块 token 预算分配

新模块申请时需声明预计 token 占用，审批时会参考全局余量：

```
总预算: 25,000 tokens
当前占用: ~18,500 tokens (v1.2.5+)
剩余: ~6,500 tokens
```

如果新模块预计超出剩余额度，必须在方案中说明如何腾出空间。

---

## 5. CLI / MCP 对等规则

- 新增 MCP tool 必须在同一 MR 中实现对应的 CLI 命令
- 新增 CLI 命令必须在同一 MR 中实现对应的 MCP tool（管理命令除外）
- 共享业务逻辑放在 `packages/core`，CLI 和 MCP 各自只做路由/展示
- CLI 新增/修改命令必须有参数路由测试（spy ToolRunner，断言参数来源）

---

## 6. Reviewer Checklist

Reviewer 审核 MCP 相关 MR 时，必须逐条检查以下项目。

### 准入检查
- [ ] 新模块已在 `docs/module-registry.md` 中注册且 status 为 approved
- [ ] 有对应的 design doc 且已被 TL approve

### Tool 设计
- [ ] Tool 命名符合 `{module}_{action}_{object?}` 格式
- [ ] Description 面向意图，不含 API 实现细节
- [ ] 参数全部扁平化，无 JSON 字符串参数
- [ ] 金额/价格类型为 string
- [ ] isWrite 标注正确（涉及资金变动 = true）
- [ ] 每个模块 tool 数量 ≤ 8（超出需说明理由）

### Token 预算
- [ ] Review comment 中报告变化前后的 tool 数量和 token 数量
- [ ] 运行统计命令：`node -e "const{allToolSpecs}=require('./packages/core/dist/index.js');const t=allToolSpecs();let c=0;t.forEach(x=>c+=JSON.stringify({name:x.name,description:x.description,inputSchema:x.inputSchema}).length);console.log(t.length+' tools, ~'+Math.round(c/4)+' tokens')"`
- [ ] 总量未超出 25,000 tokens 上限

### 对等性
- [ ] MCP tool 有对应 CLI 命令（或说明为何 CLI-only / MCP-only）
- [ ] CLI 命令有参数路由测试
- [ ] 共享逻辑在 packages/core 中

### 文档
- [ ] `skills/` 目录下对应的 SKILL.md 已在本 MR 中更新（新增/修改工具必须同步，缺少则打回）
- [ ] CHANGELOG 已更新
- [ ] README 模块计数已更新（如适用）

### 代码质量
- [ ] `pnpm build && pnpm typecheck` 通过
- [ ] `pnpm test:unit` 通过
- [ ] 无硬编码 site URL
- [ ] Error message 对 AI 友好（含 suggestion）

---

## 7. 多站点支持

- 不要硬编码 API base URL，所有请求通过 `context.client` 发出
- 如果某个功能仅特定站点支持，在 tool description 中标注，并在 handler 中做站点检查
- 参考 `docs/site-compatibility.md` 了解各站点差异

---

## 附录：现有模块参考

| Module | Tools | Read | Write | 典型 Pattern |
|--------|-------|------|-------|-------------|
| market | 13 | 13 | 0 | 纯查询，无鉴权要求 |
| spot | 16 | 5 | 11 | 完整交易生命周期 + 批量操作 + algo |
| swap | 18 | 7 | 11 | 同 spot + leverage + close position |
| futures | 18 | 7 | 11 | 与 swap 对称 |
| option | 17 | 8 | 9 | 与 swap 类似 + greeks 查询 |
| account | 14 | 12 | 2 | 以查询为主，仅 transfer 和 set_position_mode 为 write |
| bot.grid | 5 | 3 | 2 | create/stop/get 三件套 |
| bot.dca | 5 | 3 | 2 | 与 grid 对称 |
| earn.savings | 8 | 4 | 4 | purchase/redeem + lending 管理 |
| earn.onchain | 7 | 3 | 4 | offer/purchase/redeem/cancel |
| earn.dcd | 5 | 3 | 2 | subscribe/redeem + 产品查询 |
| audit | 1 | 1 | 0 | 单一 trade history 查询 |
| **Total** | **127** | **70** | **57** | |
