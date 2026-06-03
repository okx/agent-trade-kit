# 技术设计方案：修复 `market filter` / `market indicator` CLI 空输出问题

| 项 | 内容 |
|----|------|
| 文档类型 | Bug 修复技术设计方案 |
| 状态 | Draft |
| 作者 | shaolong.wang |
| 日期 | 2026-06-03 |
| 影响版本 | okx-trade-cli ≤ 1.3.6（用户反馈 1.3.5，根因在 master/1.3.6 仍存在） |
| 关联模块 | `market`（CLI 格式化层 + core indicator 工具） |

---

## 1. 问题描述

用户反馈 okx-trade-cli 直接调用如下命令出现异常：

| # | 命令 | 现象 | 期望 |
|---|------|------|------|
| 1 | `okx market filter <...>`（不加 `--json`） | 输出 `Total: 0` / `No results` | 输出筛选结果表格 |
| 1' | `okx market filter <...> --json` | 正常返回数据 | ✅ 正常 |
| 2 | `okx market indicator ema BTC-USDT --bar 1H`（不带 `--params`） | 静默无任何输出 | 输出 EMA 指标值 |
| 2' | `okx market indicator ema BTC-USDT --bar 1H --params 2` | 正常返回 | ✅ 正常 |

两个问题均通过实际调用线上接口（`https://www.okx.com`）复现并定位，已确认根因。

---

## 2. 根因分析

### Bug 1：返回数据是**数组**，CLI 当作**对象**解析

线上接口 `POST /api/v5/aigc/mcp/market-filter` 的 `data` 字段实际是一个**数组**，结果对象包在数组第 0 个元素中：

```json
{ "code": "0", "data": [ { "rows": [ { "instId": "BTC-USDT", "...": "..." } ], "total": 3 } ] }
```

而 `packages/cli/src/commands/market.ts:425-428`（`cmdMarketFilter`）把 `data` 当成对象直接取字段：

```ts
const data  = getData(result) as Record<string, unknown> | null; // data 实际是数组 [ {rows,total} ]
const rows  = (data?.["rows"]  ?? []) as Record<string, unknown>[]; // 数组["rows"]  => undefined => []
const total = data?.["total"] ?? rows.length;                       // 数组["total"] => undefined => 0
```

- 在数组上取 `["rows"]` / `["total"]` 得到 `undefined` → `rows = []`、`total = 0` → 打印 `Total: 0` / `No results`。
- 加 `--json` 时走 `printJson(data)`（第 426 行），直接 dump 整个数组，所以"正常"。

**对照证据**：同文件的 `cmdMarketOiHistory`（第 469 行）对同类 `aigc/mcp` 接口已做兼容：

```ts
const entry = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
```

`cmdMarketFilter` 漏掉了这层数组解包——这是直接根因。

**为何单测未拦截**：`packages/cli/test/market.test.ts:170` 的 mock 把 `data` 直接造成对象 `{ total, rows }`，与线上数组包裹结构不一致，导致单测通过、实测失败（fixture 与真实响应 shape 脱节）。

### Bug 2：双层根因（服务端无默认周期 + CLI 渲染静默吞空）

**① 服务端不为 EMA 等带周期指标提供默认值**——不传 `paramList` 时返回空数组：

```
不带 params:    "indicators": { "EMA": [] }                                    ← 空数组
带 paramList[2]: "indicators": { "EMA": [{ ts, values: { "2": "66870.1" } }] } ← 有值
```

`packages/core/src/tools/indicator.ts:244` 在 `params` 为空时不下发 `paramList`：

```ts
paramList: params && params.length > 0 ? params : undefined,
```

工具描述中的 "Omit to use server defaults"（省略则用服务端默认值）对 EMA 这类带周期的指标**不成立**——服务端直接回空数组，并不会套用默认周期。

**② CLI 渲染层把空结果"静默吞掉"**——`packages/cli/src/commands/market.ts:297-318`：

```ts
for (const [tf, tfData] of Object.entries(timeframes)) {
  const values = indicators?.[apiCode] as Record<string, unknown>[] | undefined; // EMA => []
  if (!values?.length) continue;   // 空数组 → 直接 continue，什么都不打印
  ...
}
```

- 外层数组非空 → `if (!outerArray?.length)`（第 284 行）的 `No data` 不触发；
- `timeframes` 存在 → 第 292 行的兜底 JSON dump 也不触发；
- 每个时间框的指标数组都为空 → 全部 `continue` → **一个字符都不输出**，即"静默失败"。

---

## 3. 修复方案

### Bug 1 修复（CLI 格式化层）

在 `cmdMarketFilter` 中对数组解包，与 `cmdMarketOiHistory` 保持一致：

```ts
const raw = getData(result);
const payload = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
const rows  = (payload?.["rows"]  ?? []) as Record<string, unknown>[];
const total = payload?.["total"] ?? rows.length;
```

- `--json` 路径保持 `printJson(getData(result))` 不变（向后兼容，输出结构不变）。
- 同步修正 `packages/cli/test/market.test.ts` 的 fixture，将 `fakeResult({ total, rows })` 改为真实的数组结构 `fakeResult([{ total, rows }])`，避免 mock 与线上 shape 再次脱节。

### Bug 2 修复（二选一，建议都做）

- **方案 A（消除静默，必做）**：渲染循环结束后若无任何输出，打印明确提示，例如
  `No indicator values returned. This indicator may require a period — try --params (e.g. --params 14).`
  消除"无反馈"的体验。
- **方案 B（补默认参数，建议做）**：为需要周期的指标（ema/ma/wma/rsi/...）在 core 或 CLI 侧维护默认参数表（如 EMA/MA 默认 `[14]`、MACD `[12,26,9]`、BB `[20,2]`），使"省略 params"真正等价于"用默认值"，与工具描述 "Omit to use server defaults" 的语义对齐。

> 备注：方案 B 需确认默认参数表的"单一数据源"位置（建议放 core，CLI 与 MCP 共用），避免 CLI / MCP 行为不一致。

---

## 4. 影响范围

| 维度 | 说明 |
|------|------|
| 受影响命令 | `okx market filter`（非 `--json`）、`okx market indicator <带周期指标>`（不带 `--params`） |
| 受影响层 | Bug1：`packages/cli/src/commands/market.ts`（仅 CLI 格式化）；Bug2：CLI 渲染 + （可选）`packages/core` indicator 默认参数 |
| MCP 工具 | `market_filter` / `market_get_indicator` 返回的 raw data 不变，LLM 侧可正常解析数组，**MCP 行为不受影响**；本次仅修 CLI 渲染（及可选的 core 默认参数） |
| 向后兼容 | Bug1 仅修非 json 渲染，`--json` 输出结构不变；Bug2 方案 A 仅新增提示文案；方案 B 改变"省略 params"的默认行为（由"空"变为"返回默认周期值"），属行为增强，需在 CHANGELOG 标注 |
| 多站点 | 修复均在数据渲染/参数组装层，与站点（www/eea/us）无关，天然兼容 |
| 测试 | 需新增/修正：① filter 数组 shape 单测；② indicator 空结果渲染单测（断言有可见提示，不再静默）；③ 如做方案 B，补默认参数路由测试 |
| Eval Probe | 修改 tool 渲染行为，需确认 `eval/probes/market/` 下相关 probe 仍有效 |

---

## 5. 验证计划

1. `pnpm build && pnpm typecheck` 无错误。
2. `pnpm test:unit` 全通过（含新增的 shape / 空结果用例）。
3. 手工回归：
   - `okx market filter SPOT --limit 5` → 输出表格（非 0）；`--json` 仍正常。
   - `okx market indicator ema BTC-USDT --bar 1H` → 输出值（方案 B）或明确提示（方案 A），不再静默。
   - `okx market indicator ema BTC-USDT --bar 1H --params 2` → 仍正常。

---

## 6. 附录：复现命令（线上接口）

```bash
# Bug 1：data 为数组 [{rows,total}]
curl -s -X POST 'https://www.okx.com/api/v5/aigc/mcp/market-filter' \
  -H 'Content-Type: application/json' -d '{"instType":"SPOT","limit":3}'

# Bug 2：不带 paramList → EMA 返回空数组
curl -s -X POST 'https://www.okx.com/api/v5/aigc/mcp/indicators' \
  -H 'Content-Type: application/json' \
  -d '{"instId":"BTC-USDT","timeframes":["1H"],"indicators":{"EMA":{"returnList":false}}}'
```
