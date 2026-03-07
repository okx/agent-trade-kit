# CLI Reference

## Installation

```bash
npm install -g @okx_ai/okx-trade-cli
```

## Global Options

| Option | Description |
|--------|-------------|
| `--profile <name>` | Choose profile from `~/.okx/config.toml` |
| `--demo` | Use simulated trading (demo) mode |
| `--json` | Raw JSON output (useful for scripting with `jq`) |
| `--help` | Show help |

```bash
# Pipe to jq
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'
```

---

## market — Market Data (no API key required)

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 5
okx market candles BTC-USDT --bar 1H --limit 10
okx market instruments --instType SWAP
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market trades BTC-USDT --limit 20
okx market index-ticker --instId BTC-USD
okx market price-limit BTC-USDT-SWAP
okx market open-interest --instType SWAP
```

Supported candle intervals: `1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

---

## account

```bash
okx account balance
okx account balance BTC,ETH
okx account asset-balance              # funding account balance
okx account positions
okx account bills
okx account bills --archive            # bills older than 7 days (up to 3 months)
okx account fees --instType SPOT
okx account config
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
okx account max-withdrawal
okx account positions-history
okx account set-position-mode --posMode net_mode
```

---

## spot — Spot Trading

```bash
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot get --instId BTC-USDT --ordId 123456
okx spot fills --instId BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
okx spot amend --instId BTC-USDT --ordId 123456 --newPx 68000
okx spot cancel BTC-USDT --ordId 123456
```

---

## swap — Perpetual Contracts

```bash
okx swap positions
okx swap orders --history
okx swap get --instId BTC-USDT-SWAP --ordId 123456
okx swap fills --instId BTC-USDT-SWAP
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap close --instId BTC-USDT-SWAP --mgnMode cross
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross
```

---

## futures — Delivery Contracts

```bash
okx futures orders
okx futures orders --history
okx futures positions
okx futures fills
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross
okx futures cancel BTC-USDT-250328 --ordId 123456
okx futures get --instId BTC-USDT-250328 --ordId 123456
```

---

## bot — Grid Trading Bots

```bash
# List running grid bots
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history

# Create a spot grid bot (invest 100 USDT, 10 grids, price range 80000–100000)
okx --demo bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# View bot details and filled sub-orders
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>

# Stop a bot
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT
```

> Grid bot tools are not available in demo mode.

---

## config

```bash
okx config show
okx config set default_profile live
```

---

## setup — Configure MCP Clients

```bash
# Write MCP server entry into client config file
okx setup --client claude-desktop
okx setup --client cursor
okx setup --client windsurf
okx setup --client vscode          # writes .mcp.json in current directory
okx setup --client claude-code     # runs claude mcp add

# With specific profile and modules
okx setup --client claude-desktop --profile live --modules market,spot,account
```

Supported clients: `claude-desktop` `cursor` `windsurf` `vscode` `claude-code`

Also available directly as `okx-trade-mcp setup --client <client>` without installing the CLI.

---

# CLI 命令参考（中文）

## 安装

```bash
npm install -g @okx_ai/okx-trade-cli
```

## 全局选项

| 选项 | 说明 |
|------|------|
| `--profile <name>` | 指定 `~/.okx/config.toml` 中的 Profile |
| `--demo` | 使用模拟盘模式 |
| `--json` | 原始 JSON 输出（便于配合 `jq` 脚本使用） |
| `--help` | 显示帮助 |

```bash
# 配合 jq 使用
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'
```

---

## market — 行情数据（无需 API Key）

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 5
okx market candles BTC-USDT --bar 1H --limit 10
okx market instruments --instType SWAP
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market trades BTC-USDT --limit 20
okx market index-ticker --instId BTC-USD
okx market price-limit BTC-USDT-SWAP
okx market open-interest --instType SWAP
```

K线周期：`1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

---

## account — 账户

```bash
okx account balance
okx account balance BTC,ETH
okx account asset-balance              # 资金账户余额
okx account positions
okx account bills
okx account bills --archive            # 7天前账单（最多3个月）
okx account fees --instType SPOT
okx account config
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
okx account max-withdrawal
okx account positions-history
okx account set-position-mode --posMode net_mode
```

---

## spot — 现货交易

```bash
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot get --instId BTC-USDT --ordId 123456
okx spot fills --instId BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
okx spot amend --instId BTC-USDT --ordId 123456 --newPx 68000
okx spot cancel BTC-USDT --ordId 123456
```

---

## swap — 永续合约

```bash
okx swap positions
okx swap orders --history
okx swap get --instId BTC-USDT-SWAP --ordId 123456
okx swap fills --instId BTC-USDT-SWAP
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap close --instId BTC-USDT-SWAP --mgnMode cross
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross
```

---

## futures — 交割合约

```bash
okx futures orders
okx futures orders --history
okx futures positions
okx futures fills
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross
okx futures cancel BTC-USDT-250328 --ordId 123456
okx futures get --instId BTC-USDT-250328 --ordId 123456
```

---

## bot — 网格交易机器人

```bash
# 查询网格机器人
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history

# 创建现货网格机器人（投入100 USDT，10个格，价格区间 80000–100000）
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# 查看机器人详情和子订单
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>

# 停止机器人
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT
```

> 网格机器人工具不支持模拟盘。

---

## config — 配置

```bash
okx config show
okx config set default_profile live
```

---

## setup — 配置 MCP 客户端

```bash
# 将 MCP Server 配置写入客户端配置文件
okx setup --client claude-desktop
okx setup --client cursor
okx setup --client windsurf
okx setup --client vscode          # 在当前目录写 .mcp.json
okx setup --client claude-code     # 调用 claude mcp add

# 指定 profile 和模块
okx setup --client claude-desktop --profile live --modules market,spot,account
```

支持的客户端：`claude-desktop` `cursor` `windsurf` `vscode` `claude-code`

不安装 CLI 也可以直接用 `okx-trade-mcp setup --client <client>`。
