# okx-mcp-server

## English

MCP server for OKX, designed for AI tools like Claude/Cursor. It exposes OKX
market, account, spot, and swap tools via Model Context Protocol (stdio).

### Install

```bash
npm install -g okx-mcp-server
```

### Configure credentials

Create `~/.okx/config.toml`:

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

### Run

```bash
okx-mcp-server --profile live         # specify profile
okx-mcp-server --modules market       # market only (no key)
okx-mcp-server --read-only            # read-only, no trades
okx-mcp-server --modules all          # all modules
```

### Claude Desktop config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "okx-mcp-server",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-demo": {
      "command": "okx-mcp-server",
      "args": ["--profile", "demo"]
    }
  }
}
```

For more details, see the repository README.

---

## 中文

OKX 的 MCP Server，供 Claude/Cursor 等 AI 工具调用，通过 MCP 协议（stdio）
暴露 OKX 的行情、账户、现货、合约工具。

### 安装

```bash
npm install -g okx-mcp-server
```

### 配置凭证

创建 `~/.okx/config.toml`：

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

### 启动

```bash
okx-mcp-server --profile live         # 指定 profile
okx-mcp-server --modules market       # 只加载行情（无需 Key）
okx-mcp-server --read-only            # 只读模式，禁止下单
okx-mcp-server --modules all          # 加载所有模块
```

### Claude Desktop 配置

在 `claude_desktop_config.json` 中新增：

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "okx-mcp-server",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-demo": {
      "command": "okx-mcp-server",
      "args": ["--profile", "demo"]
    }
  }
}
```

更多说明请参考仓库根目录 README。
