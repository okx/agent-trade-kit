# Smoke Test

用真实 OKX **demo 账号**把每个 tool 跑一遍，验证哪些端点可用、哪些不支持模拟盘。

## 前置条件

1. 在 OKX App / 网页端创建一个 **模拟盘 API Key**（带读写权限）
2. 设置环境变量：

```bash
export OKX_API_KEY=your_demo_key
export OKX_SECRET_KEY=your_demo_secret
export OKX_PASSPHRASE=your_demo_passphrase
export OKX_DEMO=1
```

## 运行

```bash
# 全量测试（含 write 操作）
node --import tsx/esm scripts/smoke-test/run.ts

# 只跑只读工具
node --import tsx/esm scripts/smoke-test/run.ts --read-only

# 只跑指定模块
node --import tsx/esm scripts/smoke-test/run.ts --module account --module spot

# 带 futures 测试（需提供有效到期日期的合约，如当季）
node --import tsx/esm scripts/smoke-test/run.ts --futures-inst BTC-USDT-250627
```

## 状态说明

| 图标 | 含义 |
|------|------|
| ✅ PASS | HTTP 200 + OKX code 0，端点正常 |
| ⚠️ WARN | HTTP 200 + OKX 业务错误（端点存在，参数/状态问题）|
| ⛔ DEMO | 该端点不支持模拟盘（`assertNotDemo` 抛出）|
| 🔑 AUTH | 认证失败，检查 API Key |
| ❌ FAIL | HTTP 404 / 网络错误 / 意外报错 |
| ⏭️ SKIP | 跳过（write 在 read-only 模式下，或手动 skip）|

## Write 工具的测试策略

Write 工具使用**故意无效**的参数（极低价格、不存在的 ordId），这样：
- 请求会打到 OKX 服务器（确认端点可达）
- OKX 返回业务错误（如"订单不存在"），不会真正成交
- 结果显示 `⚠️ WARN`，说明端点正常

例外：
- `account_transfer` — 始终 SKIP（涉及资金转移风险）
- `grid_create_order` / `grid_stop_order` — SKIP（assertNotDemo）
- `futures_*` write 工具 — 需 `--futures-inst` 才启用

## 输出

- **stdout**: 实时每行一个结果
- **`report.md`**: 跑完后生成 Markdown 格式汇总（gitignored）

## 注意

退出码：
- `0` — 无 ❌ FAIL
- `1` — 有 ❌ FAIL 或 🔑 AUTH 错误
