# News 设计文档

## Business Context

- **目标用户**: 散户、量化团队——需要实时新闻和币种情绪数据辅助交易决策的用户
- **业务优先级**: 信息增强类功能，为交易决策提供上下文
- **预期调用量**: 中频——用户主动查询时触发，或集成到日报/市场播报流程
- **依赖模块**: 无强依赖；与 market 模块配合可实现完整的"行情 + 资讯"视角
- **风控要求**: 全部 Read-only，无资金操作，无风控约束
- **站点支持**: global
- **API 权限**: OpenAPI Read（OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP）

---

## 模块职责与边界

news 模块负责加密资产的**新闻聚合**与**代币情绪分析**，覆盖两类数据源：

1. **新闻数据** — 多平台新闻搜索、浏览、全文读取
2. **情绪数据** — 基于社交媒体（X）和新闻提及的多空情绪量化

不在范围内：
- 行情数据（价格、K线、资金费率）→ `market` 模块
- 交易操作 → `spot` / `swap` / `futures` 模块

---

## Tool 清单

| 名称 | Read/Write | 说明 |
|------|-----------|------|
| `news_get_latest` | Read | 按时间倒序返回最新新闻；`importance=high` 仅返回高影响力新闻 |
| `news_get_by_coin` | Read | 按代币符号筛选新闻 |
| `news_search` | Read | 关键词全文搜索（可选 sentiment 过滤） |
| `news_get_detail` | Read | 按 ID 获取文章全文 |
| `news_get_domains` | Read | 列出支持的新闻来源域名 |
| `news_get_coin_sentiment` | Read | 代币情绪快照或时序趋势（传 `trendPoints` 切换趋势模式） |
| `news_get_sentiment_ranking` | Read | 代币热度/情绪排行榜 |

API 映射：
- 新闻类：`GET /api/v5/orbit/news-{search,detail,platform}`
- 情绪类：`GET /api/v5/orbit/currency-sentiment-{query,ranking}`

---

## Token 预算评估

| 项目 | 估算 |
|------|------|
| Tool schema（7 个 tools） | ~1,400 tokens |
| 全局变化 | 新增独立 news 模块，7 tools |
| 剩余预算 | 在 25,000 token 限制内 |

---

## 与现有模块的交互关系

```
news_get_coin_sentiment / news_get_coin_trend
  │
  └─ 情绪数据 → 辅助判断多空方向
       │
       ├─ 配合 market_get_ticker → 价格 + 情绪综合视角
       └─ 配合 news_get_by_coin  → 找到驱动情绪的具体新闻
```

---

## 典型 Workflow

### 场景 1: 查询代币近期资讯

```
1. news_get_by_coin(coins=["BTC"], importance="high") → 重要新闻列表
2. news_get_detail(id=<article_id>)                   → 读取感兴趣的全文
```

### 场景 2: 情绪分析辅助决策

```
1. news_get_coin_sentiment(coins="BTC", period="24h")               → 当前多空快照
2. news_get_coin_sentiment(coins="BTC", period="1h", trendPoints=24) → 过去24小时趋势
```

### 场景 3: 市场日报生成

```
1. news_get_latest(importance="high", limit=10)   → 今日头条
2. news_get_sentiment_ranking(sortBy="hot")        → 热度最高的代币
3. news_get_coin_sentiment(coins="BTC,ETH")        → 主流币情绪
```

---

## 关键设计决策

1. **language 无服务端默认值**：API 要求显式传入，CLI 默认 `en`，MCP 工具默认 `en`
2. **sentiment ranking sortBy 为字符串枚举**：`hot` / `bullish` / `bearish`（旧版为 0/1/2 数字，已升级）
3. **情绪接口响应外层为数组**：`data[0].dataList`，而非直接 `data.dataList`
4. **新闻 importance 服务端默认 `high`**：`news_get_latest` 不传 importance 时仅返回高重要性新闻
