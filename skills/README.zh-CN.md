[English](README.md) | [中文](README.zh-CN.md)

# Agent Skills

供 AI agent 操作 OKX 的预置 skill 文件集。每个 skill 是一个带 YAML frontmatter 的 Markdown 文件，告诉 agent 何时激活、如何执行任务。

## Skills 列表

| Skill | 说明 | 需要鉴权 |
|-------|------|:--------:|
| [`okx-cex-market`](okx-cex-market/SKILL.md) | 公开行情数据：价格、盘口、K线、资金费率、持仓量、交易对信息、技术指标 | 否 |
| [`okx-cex-trade`](okx-cex-trade/SKILL.md) | 订单管理：现货、永续合约、交割合约、期权，含条件单/OCO/追踪止损 | 是 |
| [`okx-cex-portfolio`](okx-cex-portfolio/SKILL.md) | 账户操作：余额、持仓、盈亏、手续费、资金划转 | 是 |
| [`okx-cex-bot`](okx-cex-bot/SKILL.md) | 自动化策略：现货/合约网格机器人、DCA（现货 & 合约）马丁机器人 | 是 |
| [`okx-cex-earn`](okx-cex-earn/SKILL.md) | 赚币产品：简单赚币、链上质押、双币赢、自动赚币 | 是 |

## 使用前提

- 已安装 [`okx` CLI](https://www.npmjs.com/package/@okx_ai/okx-trade-cli)：
  ```bash
  npm install -g @okx_ai/okx-trade-cli
  ```
- 需要鉴权的 skill：需在 `~/.okx/config.toml` 中配置 OKX API 凭证：
  ```bash
  okx config init
  ```

## Skill 格式

每个 skill 是带 YAML frontmatter 的 Markdown 文件：

```yaml
---
name: skill-name
description: "供 AI agent 路由系统判断激活时机的触发描述。"
license: MIT
metadata:
  author: okx
  version: "1.0.0"
  agent:
    requires:
      bins: ["okx"]
---
```

`description` 字段由 agent 路由系统用于决定何时激活本 skill。包含 `references/` 子目录的 skill 使用 `{baseDir}` 作为运行时路径变量，指向该 skill 所在目录。

## 贡献

新增或修改 skill：

1. 遵循现有 SKILL.md 结构（frontmatter + 前置条件 + 命令索引 + 操作流程）
2. 较大的 skill 将参考文件放在 `references/` 子目录
3. frontmatter 中的 `description` 要尽量穷举触发场景——它直接影响 agent 路由准确率
4. 分支与 review 规范见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 许可证

MIT — 见 [LICENSE](../LICENSE)。
