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

## bot — Trading Bots

```bash
# ── Spot Grid (algoOrdType: grid) ─────────────────────────────────────────────
# List / query
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history
okx bot grid orders --algoOrdType grid --instId BTC-USDT
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>          # filled trades
okx bot grid sub-orders --algoOrdType grid --algoId <algoId> --live   # live orders

# Create spot grid — invest in quote currency (USDT)
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# Create spot grid — invest in base currency (BTC)
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --baseSz 0.001

# Create spot grid — geometric spacing (runType 2)
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100 --runType 2

# Stop spot grid (stopType: 1=sell all holdings, 2=keep holdings)
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT --stopType 1
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT --stopType 2

# ── Contract Grid (algoOrdType: contract_grid) ────────────────────────────────
# List / query
okx bot grid orders --algoOrdType contract_grid
okx bot grid orders --algoOrdType contract_grid --history
okx bot grid details --algoOrdType contract_grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType contract_grid --algoId <algoId>

# Create contract grid — neutral direction, 3x leverage, 100 USDT margin
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 \
  --direction neutral --lever 3 --sz 100

# Create contract grid — long direction, 5x leverage, 100 USDT margin
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 \
  --direction long --lever 5 --sz 100

# Create contract grid — short direction, 3x leverage, 100 USDT margin
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 \
  --direction short --lever 3 --sz 100

# Stop contract grid (stopType: 1=close position+stop, 2=keep position+stop)
okx bot grid stop --algoId <algoId> --algoOrdType contract_grid --instId BTC-USDT-SWAP --stopType 1
okx bot grid stop --algoId <algoId> --algoOrdType contract_grid --instId BTC-USDT-SWAP --stopType 2

# ── Moon Grid (algoOrdType: moon_grid) — list/query only ─────────────────────
okx bot grid orders --algoOrdType moon_grid
okx bot grid details --algoOrdType moon_grid --algoId <algoId>

# ── Spot DCA ──────────────────────────────────────────────────────────────────
okx bot dca orders
okx bot dca orders --history
okx bot dca details --algoId <algoId>
okx bot dca sub-orders --algoId <algoId>            # filled sub-orders
okx bot dca sub-orders --algoId <algoId> --live     # live (pending) sub-orders

okx bot dca create \
  --instId BTC-USDT \
  --triggerType 1 \
  --initOrdAmt 50 --safetyOrdAmt 30 --maxSafetyOrds 3 \
  --pxSteps 0.05 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.20 --slMode market

okx bot dca stop --algoId <algoId> --instId BTC-USDT --stopType 2

# ── Contract DCA ───────────────────────────────────────────────────────────
okx bot dca orders --type contract
okx bot dca orders --type contract --history
okx bot dca details --type contract --algoId <algoId>
okx bot dca sub-orders --type contract --algoId <algoId>

okx bot dca create --type contract \
  --instId BTC-USDT-SWAP --lever 3 --side buy \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.15 --slMode market

okx bot dca stop --type contract --algoId <algoId> --instId BTC-USDT-SWAP --stopType 1
```

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

## bot — 交易机器人

```bash
# ── 现货网格（algoOrdType: grid）─────────────────────────────────────────────
# 查询
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history
okx bot grid orders --algoOrdType grid --instId BTC-USDT
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>          # 已成交子订单
okx bot grid sub-orders --algoOrdType grid --algoId <algoId> --live   # 挂单中子订单

# 创建现货网格 — 用计价货币（USDT）投入
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# 创建现货网格 — 用基础货币（BTC）投入
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --baseSz 0.001

# 创建现货网格 — 等比间距（runType 2）
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100 --runType 2

# 停止现货网格（stopType: 1=卖出全部持仓, 2=保留持仓）
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT --stopType 1
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT --stopType 2

# ── 合约网格（algoOrdType: contract_grid）────────────────────────────────────
# 查询
okx bot grid orders --algoOrdType contract_grid
okx bot grid orders --algoOrdType contract_grid --history
okx bot grid details --algoOrdType contract_grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType contract_grid --algoId <algoId>

# 创建合约网格 — neutral 方向，3倍杠杆，100 USDT 保证金
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 \
  --direction neutral --lever 3 --sz 100

# 创建合约网格 — 做多，5倍杠杆，100 USDT 保证金
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 \
  --direction long --lever 5 --sz 100

# 创建合约网格 — 做空，3倍杠杆，100 USDT 保证金
okx bot grid create --instId BTC-USDT-SWAP --algoOrdType contract_grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 \
  --direction short --lever 3 --sz 100

# 停止合约网格（stopType: 1=平仓并停止, 2=保留仓位并停止）
okx bot grid stop --algoId <algoId> --algoOrdType contract_grid --instId BTC-USDT-SWAP --stopType 1
okx bot grid stop --algoId <algoId> --algoOrdType contract_grid --instId BTC-USDT-SWAP --stopType 2

# ── 月网格（algoOrdType: moon_grid）— 仅支持查询 ─────────────────────────────
okx bot grid orders --algoOrdType moon_grid
okx bot grid details --algoOrdType moon_grid --algoId <algoId>

# ── 现货 DCA ──────────────────────────────────────────────────────────────────
okx bot dca orders
okx bot dca orders --history
okx bot dca details --algoId <algoId>
okx bot dca sub-orders --algoId <algoId>            # 已成交子订单
okx bot dca sub-orders --algoId <algoId> --live     # 挂单中子订单

okx bot dca create \
  --instId BTC-USDT \
  --triggerType 1 \
  --initOrdAmt 50 --safetyOrdAmt 30 --maxSafetyOrds 3 \
  --pxSteps 0.05 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.20 --slMode market

okx bot dca stop --algoId <algoId> --instId BTC-USDT --stopType 2

# ── 合约 DCA ───────────────────────────────────────────────────────────────
okx bot dca orders --type contract
okx bot dca orders --type contract --history
okx bot dca details --type contract --algoId <algoId>
okx bot dca sub-orders --type contract --algoId <algoId>

okx bot dca create --type contract \
  --instId BTC-USDT-SWAP --lever 3 --side buy \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.15 --slMode market

okx bot dca stop --type contract --algoId <algoId> --instId BTC-USDT-SWAP --stopType 1
```

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
