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
# With attached TP/SL
okx spot place --instId BTC-USDT --side buy --ordType limit --sz 0.001 --px 60000 \
  --tpTriggerPx 65000 --tpOrdPx 64900 --slTriggerPx 58000 --slOrdPx 57900
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
# With attached TP/SL
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross \
  --tpTriggerPx 100000 --tpOrdPx 99900 --slTriggerPx 85000 --slOrdPx 84900
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
# With attached TP/SL
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross \
  --tpTriggerPx 100000 --tpOrdPx 99900 --slTriggerPx 85000 --slOrdPx 84900
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

# ── Contract DCA ──────────────────────────────────────────────────────────────
okx bot dca orders
okx bot dca orders --history
okx bot dca details --algoId <algoId>
okx bot dca sub-orders --algoId <algoId>
okx bot dca sub-orders --algoId <algoId> --cycleId <cycleId>

okx bot dca create \
  --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 --tpPct 0.03
# Note: safetyOrdAmt, pxSteps, pxStepsMult, volMult are required when maxSafetyOrds > 0

# With optional params (stop-loss, trigger strategy)
okx bot dca create \
  --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.15 --slMode market

okx bot dca stop --algoId <algoId>
```

---

## copytrading — Copy Trading

```bash
# Browse top lead traders (default: SWAP)
okx copytrading traders
okx copytrading traders --limit 20

# View your currently followed lead traders and their cumulative P&L
okx copytrading status

# Start following a trader — smart_copy mode (default, allocates real funds)
okx copytrading follow --uniqueCode <16-char-code> --initialAmount 1000 --replicationRequired 1

# Start following a trader — fixed_amount mode (fixed USDT per order)
okx copytrading follow --uniqueCode <16-char-code> --copyMode fixed_amount --copyTotalAmt 5000 --copyAmt 100

# Start following a trader — ratio_copy mode (copy by ratio)
okx copytrading follow --uniqueCode <16-char-code> --copyMode ratio_copy --copyTotalAmt 5000 --copyRatio 0.1

# With take-profit / stop-loss
okx copytrading follow --uniqueCode <16-char-code> --initialAmount 1000 --replicationRequired 1 --tpRatio 0.2 --slRatio 0.1

# Custom instruments only (copyInstIdType=custom requires --instId)
okx copytrading follow --uniqueCode <16-char-code> --initialAmount 1000 --replicationRequired 1 --copyInstIdType custom --instId BTC-USDT-SWAP,ETH-USDT-SWAP

# Stop following a trader
okx copytrading unfollow --uniqueCode <16-char-code>

# View a trader's stats, P&L, and currency preference
okx copytrading trader-detail --uniqueCode <16-char-code>
okx copytrading trader-detail --uniqueCode <16-char-code> --lastDays 1
```

> **Note:** `copytrading` module is not loaded by default. Enable it with `--modules copytrading` or add it to your profile.

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
# 附带止盈止损
okx spot place --instId BTC-USDT --side buy --ordType limit --sz 0.001 --px 60000 \
  --tpTriggerPx 65000 --tpOrdPx 64900 --slTriggerPx 58000 --slOrdPx 57900
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
# 附带止盈止损
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross \
  --tpTriggerPx 100000 --tpOrdPx 99900 --slTriggerPx 85000 --slOrdPx 84900
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
# 附带止盈止损
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross \
  --tpTriggerPx 100000 --tpOrdPx 99900 --slTriggerPx 85000 --slOrdPx 84900
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

# ── 合约 DCA ──────────────────────────────────────────────────────────────────
okx bot dca orders
okx bot dca orders --history
okx bot dca details --algoId <algoId>
okx bot dca sub-orders --algoId <algoId>
okx bot dca sub-orders --algoId <algoId> --cycleId <cycleId>

okx bot dca create \
  --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 --tpPct 0.03
# 注意：当 maxSafetyOrds > 0 时，safetyOrdAmt、pxSteps、pxStepsMult、volMult 为必填

# 带可选参数（止损、触发策略）
okx bot dca create \
  --instId BTC-USDT-SWAP --lever 3 --direction long \
  --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
  --pxSteps 0.03 --pxStepsMult 1 --volMult 1 \
  --tpPct 0.03 --slPct 0.15 --slMode market

okx bot dca stop --algoId <algoId>
```

---

## copytrading — 跟单交易

```bash
# 查看排行榜上的带单员（默认 SWAP，支持 SPOT）
okx copytrading traders
okx copytrading traders --limit 20

# 查看我当前跟随的带单员及累计盈亏
okx copytrading status

# 开始跟单 — 智能跟单模式（默认，会使用真实资金）
okx copytrading follow --uniqueCode <16位代码> --initialAmount 1000 --replicationRequired 1

# 开始跟单 — 固定金额模式（每单固定 USDT）
okx copytrading follow --uniqueCode <16位代码> --copyMode fixed_amount --copyTotalAmt 5000 --copyAmt 100

# 开始跟单 — 固定比例模式（按比例跟单）
okx copytrading follow --uniqueCode <16位代码> --copyMode ratio_copy --copyTotalAmt 5000 --copyRatio 0.1

# 带止盈止损
okx copytrading follow --uniqueCode <16位代码> --initialAmount 1000 --replicationRequired 1 --tpRatio 0.2 --slRatio 0.1

# 自定义跟单品种（copyInstIdType=custom 时 --instId 必填）
okx copytrading follow --uniqueCode <16位代码> --initialAmount 1000 --replicationRequired 1 --copyInstIdType custom --instId BTC-USDT-SWAP,ETH-USDT-SWAP

# 停止跟单
okx copytrading unfollow --uniqueCode <16位代码>

# 查看带单员详情（统计数据、每日盈亏、偏好币种）
okx copytrading trader-detail --uniqueCode <16位代码>
okx copytrading trader-detail --uniqueCode <16位代码> --lastDays 1
```

> **注意：** `copytrading` 模块默认不加载，使用 `--modules copytrading` 或在配置文件中启用。

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
