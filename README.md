# okx-hub


OKX toolkit with two standalone packages:

| Package | Description |
|---|---|
| `okx-mcp-server` | MCP server for Claude/Cursor |
| `okx-cli` | CLI for operating OKX from terminal |

---

## Quick Start

**Prerequisites:** Node.js >= 18, pnpm (installed in step 1 if missing)

```bash
# 1. Install pnpm (skip if already)
npm install -g pnpm && pnpm setup && source ~/.zshrc

# 2. Install deps & build
pnpm install && pnpm run build

# 3. Configure API credentials
mkdir -p ~/.okx && cp config.toml.example ~/.okx/config.toml
vim ~/.okx/config.toml
```

Fill live and demo keys in `~/.okx/config.toml`:

```toml
default_profile = "demo"

[profiles.live]
api_key = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> Live key: OKX website → Profile → API → Create API Key  
> Demo key: OKX website → Trading → Demo Trading → API Management

After build, choose your usage:

- **AI integrations (Claude / Cursor)** → See [okx-mcp-server](#okx-mcp-server)
- **CLI usage** → See [okx-cli](#okx-cli)

---

## okx-mcp-server

### Config

**Claude Desktop config path:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Credentials are read from `~/.okx/config.toml`; only profile is needed in JSON:

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "node",
      "args": ["/path/to/okx_hub/packages/mcp/dist/index.js", "--profile", "live", "--modules", "all"]
    },
    "okx-demo": {
      "command": "node",
      "args": ["/path/to/okx_hub/packages/mcp/dist/index.js", "--profile", "demo"]
    }
  }
}
```

Restart Claude Desktop after updating the config.

### Startup Options

```bash
okx-mcp-server --profile live         # specify profile
okx-mcp-server --modules market       # market only (no key)
okx-mcp-server --read-only            # read-only, no trades
okx-mcp-server --modules all          # all modules
```

---

## okx-cli

### Install

```bash
# Register global okx command (run once after build)
cd packages/cli && pnpm link --global && cd ../..

# Verify
okx market ticker BTC-USDT   # no key required
okx --profile demo account balance
okx --profile live swap positions
```

### Commands

#### Market data (no API key required)

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 5
okx market candles BTC-USDT --bar 1H --limit 10
```

Supported candle intervals: `1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

#### Account

```bash
okx account balance
okx account balance BTC,ETH
```

#### Spot Trading

```bash
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot fills --instId BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
okx spot cancel BTC-USDT --ordId 123456
```

#### Swap Trading

```bash
okx swap positions
okx swap orders --history
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap place --instId BTC-USDT-SWAP --side sell --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
```

#### Config

```bash
okx config show
okx config set default_profile live
```

### Global Options

| Option | Description |
|---|---|
| `--profile <name>` | choose profile |
| `--json` | raw JSON output |
| `--help` | show help |

```bash
# Use with jq
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'

# With analysis script + Claude
okx market candles BTC-USDT --bar 1H --limit 200 --json \
  | python3 demo/cli/analyze.py --inst BTC-USDT \
  | claude -p "基于以上技术分析，现在值得做多吗？给出简短建议"
```

---

## Development

```bash
pnpm install && pnpm run build

# Build individually
pnpm --filter @okx-hub/core build
pnpm --filter okx-mcp-server build
pnpm --filter okx-cli build
```

### Project Structure

```
packages/
├── core/    # shared client & tools
├── mcp/     # MCP Server
└── cli/     # CLI tool
demo/
└── cli/     # analysis example (analyze.py + run.sh)
docs/
└── tech-design-phase1.md   # design doc
```

---


OKX 工具集，包含两个独立包：

| 包 | 说明 |
|---|---|
| `okx-mcp-server` | MCP Server，供 Claude / Cursor 等 AI 工具调用 |
| `okx-cli` | 命令行工具，直接在终端操作 OKX |

---

## 快速开始

**前置要求：** Node.js >= 18，pnpm（没有的话第一步会装）

```bash
# 1. 安装 pnpm（已装可跳过）
npm install -g pnpm && pnpm setup && source ~/.zshrc

# 2. 安装依赖 & 构建
pnpm install && pnpm run build

# 3. 配置 API 凭证
mkdir -p ~/.okx && cp config.toml.example ~/.okx/config.toml
vim ~/.okx/config.toml
```

`~/.okx/config.toml` 填入真实盘和模拟盘的 Key：

```toml
default_profile = "demo"

[profiles.live]
api_key = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> 真实盘 Key：OKX 官网 → 个人中心 → API → 创建 API Key  
> 模拟盘 Key：OKX 官网 → 交易 → 模拟交易 → API 管理

构建完成后按使用场景选择：

- **AI 工具集成（Claude / Cursor）** → 看 [okx-mcp-server](#okx-mcp-server)
- **终端命令行** → 看 [okx-cli](#okx-cli)

---

## okx-mcp-server

### 配置

**Claude Desktop 配置文件路径：**
- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

凭证从 `~/.okx/config.toml` 读取，JSON 里只需指定 profile：

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "node",
      "args": ["/path/to/okx_hub/packages/mcp/dist/index.js", "--profile", "live", "--modules", "all"]
    },
    "okx-demo": {
      "command": "node",
      "args": ["/path/to/okx_hub/packages/mcp/dist/index.js", "--profile", "demo"]
    }
  }
}
```

修改配置后重启 Claude Desktop 生效。

### 启动选项

```bash
okx-mcp-server --profile live         # 指定 profile
okx-mcp-server --modules market       # 只加载行情（无需 Key）
okx-mcp-server --read-only            # 只读模式，禁止下单
okx-mcp-server --modules all          # 加载所有模块
```

---

## okx-cli

### 安装

```bash
# 注册 okx 全局命令（构建完成后执行一次）
cd packages/cli && pnpm link --global && cd ../..

# 验证
okx market ticker BTC-USDT   # 无需 Key，直接可用
okx --profile demo account balance
okx --profile live swap positions
```

### 命令

#### 市场行情（无需 API Key）

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 5
okx market candles BTC-USDT --bar 1H --limit 10
```

支持的 K 线周期：`1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

#### 账户

```bash
okx account balance
okx account balance BTC,ETH
```

#### 现货交易

```bash
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot fills --instId BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
okx spot cancel BTC-USDT --ordId 123456
```

#### 合约交易

```bash
okx swap positions
okx swap orders --history
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap place --instId BTC-USDT-SWAP --side sell --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
```

#### 配置管理

```bash
okx config show
okx config set default_profile live
```

### 全局选项

| 选项 | 说明 |
|---|---|
| `--profile <name>` | 指定 profile |
| `--json` | 输出原始 JSON（适合脚本/管道处理） |
| `--help` | 显示帮助 |

```bash
# 结合 jq 使用
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'

# 结合技术分析脚本 + Claude
okx market candles BTC-USDT --bar 1H --limit 200 --json \
  | python3 demo/cli/analyze.py --inst BTC-USDT \
  | claude -p "基于以上技术分析，现在值得做多吗？给出简短建议"
```

---

## 开发

```bash
pnpm install && pnpm run build

# 单独构建
pnpm --filter @okx-hub/core build
pnpm --filter okx-mcp-server build
pnpm --filter okx-cli build
```

### 项目结构

```
packages/
├── core/    # 共享 OKX client、tools、工具函数
├── mcp/     # MCP Server
└── cli/     # CLI 工具
demo/
└── cli/     # 技术分析示例（analyze.py + run.sh）
docs/
└── tech-design-phase1.md   # 技术设计文档
```
