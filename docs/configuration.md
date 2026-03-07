# Configuration

## API Credentials

All credentials are stored in `~/.okx/config.toml`. The client config only needs the profile name.

The easiest way to set this up is the interactive wizard:

```bash
okx config init
```

Or configure manually with a minimal single-profile setup:

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> **Demo key:** [Create API Key (Demo Trading)](https://www.okx.com/account/my-api?go-demo-trading=1)
>
> **Live key:** [Create API Key (Live Trading)](https://www.okx.com/account/my-api?go-live-trading=1)
>
> EEA users: replace `www.okx.com` with `my.okx.com` · US users: use `app.okx.com`

**Required API permissions:** Read + Trade. Withdraw permission is not required or recommended.

### Site Configuration

OKX operates independent regional sites. Users must use the API of the site where their account is registered.

| Site | User URL | API Base URL |
|------|----------|-------------|
| `global` (default) | `www.okx.com` | `https://www.okx.com` |
| `eea` | `my.okx.com` | `https://eea.okx.com` |
| `us` | `app.okx.com` | `https://app.okx.com` |

Set the site in your profile:

```toml
[profiles.main]
site = "global"          # global | eea | us  (default: global)
api_key = "your-api-key"
secret_key = "your-secret-key"
passphrase = "your-passphrase"
```

Or override at startup via flag or env var:

```bash
# Flag
agent-tradekit-mcp --site eea

# Environment variable (useful in Docker / CI)
OKX_SITE=us agent-tradekit-mcp
```

Priority: `--site` flag > `OKX_SITE` env var > `site` in toml > default `global`

> **Note:** `OKX_API_BASE_URL` / `base_url` in toml still override the site mapping entirely — useful for testing against a custom endpoint.

### Multiple profiles

You can define as many profiles as you like. Each MCP server instance uses one profile, so you can run demo and live side by side:

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true

[profiles.live]
api_key = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

# Optional: a second live account (e.g. sub-account)
[profiles.live-sub]
api_key = "your-sub-api-key"
secret_key = "your-sub-secret-key"
passphrase = "your-sub-passphrase"
```

Then register each as a separate MCP server in your client config:

```json
{
  "mcpServers": {
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-live": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-live-sub": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live-sub", "--modules", "all"]
    }
  }
}
```

Your AI can switch between them simply by calling tools on the appropriate server.

---

## Setup Command

The fastest way to configure a client is the `setup` subcommand — no manual JSON editing required.

```bash
# Configure Claude Desktop
okx-trade-mcp setup --client claude-desktop

# Configure Cursor
okx-trade-mcp setup --client cursor

# Configure VS Code (writes .mcp.json in current directory)
okx-trade-mcp setup --client vscode

# Configure Claude Code CLI
okx-trade-mcp setup --client claude-code

# Use a specific profile and modules
okx-trade-mcp setup --client claude-desktop --profile live --modules market,spot,account
```

Also available as `okx setup --client <client>` if `okx-trade-cli` is installed.

| `--client` | Target |
|------------|--------|
| `claude-desktop` | `~/Library/Application\ Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\...` (Windows) |
| `cursor` | `~/.cursor/mcp.json` |
| `windsurf` | `~/.codeium/windsurf/mcp_config.json` |
| `vscode` | `.mcp.json` in current directory |
| `claude-code` | runs `claude mcp add` |

The command reads existing config and merges the new entry — it will not overwrite other MCP servers.

---

## Client Setup (Manual)

### Claude Desktop

Config file:
- macOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

Restart Claude Desktop after updating the config.

### Cursor

Config file: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level)

```json
{
  "mcpServers": {
    "okx-trade": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add --transport stdio okx-trade-mcp -- okx-trade-mcp --profile demo --modules all
```

Or create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### VS Code

Create `.mcp.json` in your project root (or `~/.claude.json` for global scope):

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### Windsurf

Config file:
- macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### openCxxW

Config file: `openCxxW.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

---

## Startup Scenarios

### Market data only (no API key required)

Watch prices, orderbook, candles without any credentials:

```json
{
  "mcpServers": {
    "okx-market": {
      "command": "okx-trade-mcp",
      "args": ["--modules", "market"]
    }
  }
}
```

### Read-only account monitoring

Has API key but prevents any order placement:

```json
{
  "mcpServers": {
    "okx-readonly": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all", "--read-only"]
    }
  }
}
```

### Spot trading only

Minimal setup for spot trading — skips swap, futures, and bot modules:

```json
{
  "mcpServers": {
    "okx-spot": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "market", "spot", "account"]
    }
  }
}
```

### Demo (simulated trading)

Safe environment for testing — uses OKX paper trading, no real funds at risk:

```json
{
  "mcpServers": {
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

> **Note:** Grid bot tools (`bot` module) are not supported in demo mode — OKX does not expose those endpoints for simulated trading.

### Full setup (live + demo side by side)

Register both as separate MCP servers. Your AI can switch between them:

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

---

## All Startup Options

| Option | Description |
|--------|-------------|
| `--profile <name>` | Profile from `~/.okx/config.toml` (default: value of `default_profile`) |
| `--modules <list>` | Comma-separated module names, or `all`. Default: `spot swap account` |
| `--read-only` | Disable all write operations (orders, position changes, bot creation) |
| `--no-log` | Disable audit logging to `~/.okx/logs/` |
| `--log-level <level>` | Minimum log level: `debug`, `info`, `warn`, `error` (default: `info`) |

---

# 配置（中文）

## API 凭证

所有凭证存储在 `~/.okx/config.toml`，客户端配置只需指定 Profile 名称。

最简单的单账号配置：

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> **模拟盘 Key：** [创建 API Key（模拟盘）](https://www.okx.com/zh-hans/account/my-api?go-demo-trading=1)
>
> **实盘 Key：** [创建 API Key（实盘）](https://www.okx.com/zh-hans/account/my-api?go-live-trading=1)
>
> EEA 用户：将 `www.okx.com` 替换为 `my.okx.com`；US 用户：使用 `app.okx.com`

**所需 API 权限：** 读取 + 交易。无需也不建议开启提币权限。

### 站点配置

OKX 运营多个独立的区域站点，用户需要使用其账号所在站点的 API。

| 站点 | 用户网址 | API Base URL |
|------|----------|-------------|
| `global`（默认） | `www.okx.com` | `https://www.okx.com` |
| `eea` | `my.okx.com` | `https://eea.okx.com` |
| `us` | `app.okx.com` | `https://app.okx.com` |

在 Profile 中指定站点：

```toml
[profiles.main]
site = "global"          # global | eea | us（默认：global）
api_key = "your-api-key"
secret_key = "your-secret-key"
passphrase = "your-passphrase"
```

也可以通过命令行参数或环境变量覆盖：

```bash
# 命令行参数
agent-tradekit-mcp --site eea

# 环境变量（适用于 Docker / CI）
OKX_SITE=us agent-tradekit-mcp
```

优先级：`--site` 参数 > `OKX_SITE` 环境变量 > toml 中的 `site` > 默认 `global`

> **注意：** `OKX_API_BASE_URL` 环境变量 / toml 中的 `base_url` 仍然优先级最高，会完全覆盖站点映射——适合高级用户或自定义测试场景。

### 多账号配置

可以定义多个 Profile，每个 MCP Server 实例使用一个 Profile，模拟盘和实盘可以并行运行：

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true

[profiles.live]
api_key = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

# 可选：第二个实盘账号（如子账号）
[profiles.live-sub]
api_key = "your-sub-api-key"
secret_key = "your-sub-secret-key"
passphrase = "your-sub-passphrase"
```

然后在客户端配置中分别注册为独立的 MCP Server：

```json
{
  "mcpServers": {
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-live": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-live-sub": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live-sub", "--modules", "all"]
    }
  }
}
```

AI 可以直接通过调用对应 Server 的工具来切换账号。

---

## Setup 命令

最快的配置方式是 `setup` 子命令，无需手动编辑 JSON。

```bash
# 配置 Claude Desktop
okx-trade-mcp setup --client claude-desktop

# 配置 Cursor
okx-trade-mcp setup --client cursor

# 配置 VS Code（在当前目录写 .mcp.json）
okx-trade-mcp setup --client vscode

# 配置 Claude Code CLI
okx-trade-mcp setup --client claude-code

# 指定 profile 和模块
okx-trade-mcp setup --client claude-desktop --profile live --modules market,spot,account
```

安装了 `okx-trade-cli` 的话，也可以用 `okx setup --client <client>`。

| `--client` | 目标 |
|------------|------|
| `claude-desktop` | macOS: `~/Library/Application\ Support/Claude/...` / Windows: `%APPDATA%\Claude\...` |
| `cursor` | `~/.cursor/mcp.json` |
| `windsurf` | `~/.codeium/windsurf/mcp_config.json` |
| `vscode` | 当前目录下的 `.mcp.json` |
| `claude-code` | 调用 `claude mcp add` |

命令会读取现有配置并合并写入，不会覆盖其他已有的 MCP Server 条目。

---

## 客户端配置（手动）

### Claude Desktop

配置文件路径：
- macOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

修改配置后重启 Claude Desktop 生效。

### Cursor

配置文件：`~/.cursor/mcp.json`（全局）或 `.cursor/mcp.json`（项目级）

```json
{
  "mcpServers": {
    "okx-trade": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add --transport stdio okx-trade-mcp -- okx-trade-mcp --profile demo --modules all
```

或在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### VS Code

在项目根目录创建 `.mcp.json`（或 `~/.claude.json` 用于全局配置）：

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### Windsurf

配置文件：
- macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

### openCxxW

配置文件：`openCxxW.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

---

## 启动场景

### 仅行情（无需 API Key）

查看价格、盘口、K线，无需任何凭证：

```json
{
  "mcpServers": {
    "okx-market": {
      "command": "okx-trade-mcp",
      "args": ["--modules", "market"]
    }
  }
}
```

### 只读账户监控

有 API Key 但禁止任何下单操作：

```json
{
  "mcpServers": {
    "okx-readonly": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all", "--read-only"]
    }
  }
}
```

### 仅现货交易

最小化配置，跳过永续/交割/Bot 模块：

```json
{
  "mcpServers": {
    "okx-spot": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "market", "spot", "account"]
    }
  }
}
```

### 模拟盘（模拟交易）

用 OKX 模拟盘安全测试，不涉及真实资金：

```json
{
  "mcpServers": {
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

> **注意：** 网格机器人工具（`bot` 模块）不支持模拟盘——OKX 不对模拟交易账号开放相关端点。

### 完整配置（实盘 + 模拟盘并行）

同时注册两个 MCP Server，AI 可自由切换：

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    },
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

---

## 全部启动参数

| 参数 | 说明 |
|------|------|
| `--profile <name>` | 指定 `~/.okx/config.toml` 中的 Profile（默认：`default_profile` 的值） |
| `--modules <list>` | 逗号分隔的模块名，或 `all`。默认：`spot swap account` |
| `--read-only` | 禁用所有写操作（下单、改单、修改仓位、创建/停止 Bot 等） |
| `--no-log` | 禁用审计日志（默认写入 `~/.okx/logs/`） |
| `--log-level <level>` | 最低日志级别：`debug`、`info`、`warn`、`error`（默认：`info`） |
