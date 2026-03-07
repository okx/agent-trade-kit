[English](README.md) | [中文](README.zh-CN.md)

# okx-trade-mcp

MCP server for OKX, designed for AI tools like Claude/Cursor. It exposes OKX
market, account, spot, and swap tools via Model Context Protocol (stdio).

### Install

```bash
npm install -g @okx_ai/okx-trade-mcp
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
okx-trade-mcp --profile live         # specify profile
okx-trade-mcp --modules market       # market only (no key)
okx-trade-mcp --read-only            # read-only, no trades
okx-trade-mcp --modules all          # all modules
```

### Claude Desktop config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "okx-live": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-demo": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo"]
    }
  }
}
```

For more details, see the [repository README](../../README.md).
