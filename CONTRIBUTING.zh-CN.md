[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

# 贡献指南 — OKX Agent TradeKit

感谢你对本项目的关注！本指南涵盖了参与贡献所需的一切信息。

---

## 开发环境

**前置要求：**

- Node.js >= 18
- pnpm >= 9

```bash
# 安装 pnpm（如已安装可跳过）
npm install -g pnpm

# 克隆仓库
git clone https://github.com/okx/agent-tradekit.git
cd okx-trade-mcp

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 对所有包进行类型检查
pnpm typecheck
```

---

## OKX 模拟账户设置

集成测试（冒烟测试和端到端测试）需要真实的 OKX API 凭证。请使用**模拟交易**账户，以避免真实资金风险。

1. 登录 [OKX](https://www.okx.com)
2. 前往 **交易 → 模拟交易 → API 管理**
3. 创建一个具有**交易**权限的 API 密钥
4. 将密钥、密钥密文和密码短语复制到 `~/.okx/config.toml`：

```bash
mkdir -p ~/.okx && cp config.toml.example ~/.okx/config.toml
```

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> OKX 模拟交易注册：https://www.okx.com/demo-trading

---

## 运行测试

### 单元测试（无需凭证）

```bash
# 在所有包中运行单元测试
pnpm test:unit
```

### 冒烟测试（需要模拟交易凭证）

```bash
bash test/smoke.sh
```

预期输出：`19/19 passed`

### MCP 端到端测试（需要模拟交易凭证）

```bash
node test/mcp-e2e.mjs
```

---

## 添加新工具

1. 打开 `packages/core/src/tools/` 中对应的模块文件（例如 `spot-trade.ts`）
2. 在导出的数组中添加一个新的 `ToolSpec` 对象：

```typescript
{
  name: "spot_example",
  module: "spot",
  description: "What this tool does, written for AI understanding.",
  inputSchema: {
    type: "object",
    properties: {
      instId: { type: "string", description: "Instrument ID, e.g. BTC-USDT" },
    },
    required: ["instId"],
  },
  isWrite: false,   // true for POST/mutating operations
  handler: async (args, { client, config: _config }) => {
    const a = asRecord(args);
    const instId = requireString(a, "instId");
    return client.publicGet("/api/v5/some/endpoint", { instId });
  },
}
```

3. 无需修改 `server.ts` 或 `index.ts` — 工具通过 `buildTools()` 自动注册。
4. 如果工具包含非平凡的逻辑，请在 `packages/core/test/` 中添加单元测试。

如需添加新**模块**，请参阅 [ARCHITECTURE.md](ARCHITECTURE.zh-CN.md) 第 10 节。

---

## Pull Request 指南

### 分支命名

```
feat/<short-description>     # 新功能
fix/<short-description>      # 缺陷修复
test/<short-description>     # 仅测试
docs/<short-description>     # 仅文档
refactor/<short-description> # 重构
```

### 提交信息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

[可选正文]
```

示例：
```
feat(swap): add trailing stop order tool
fix(rate-limiter): handle zero refill rate edge case
test(core): add signature unit tests
docs: translate ARCHITECTURE.md to English
```

### 提交 PR 前

```bash
pnpm build      # 必须通过
pnpm typecheck  # 必须通过
pnpm test:unit  # 必须通过
```

### PR 描述

请填写 Pull Request 模板 — 描述变更内容、测试方式，并勾选相关选项。

---

## 代码风格

- **语言**：TypeScript，ESM 模块（`"type": "module"`）
- **构建**：`tsup`（基于 esbuild）— 未经讨论请勿修改 `tsconfig.json`
- **格式化**：Prettier 默认配置（无配置文件 — 保持简洁）
- **禁止默认导出** — 使用命名导出
- **错误处理**：从 `OkxMcpError` 层级体系抛出异常；禁止抛出原始字符串
- **禁止使用 `any`** — 使用 `unknown` 并显式缩窄类型

---

## 有问题？

在 [GitHub Discussions](https://github.com/okx/agent-tradekit/discussions) 中发起讨论，或提交带有 `question` 标签的 issue。
