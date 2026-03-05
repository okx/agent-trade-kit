# Site Compatibility

This document summarises API compatibility across the three supported OKX sites,
based on smoke-test results against live / demo accounts (read-only mode).

| | Global | EEA | US |
|---|:---:|:---:|:---:|
| API base URL | `www.okx.com` | `eea.okx.com` | `app.okx.com` |
| Simulated trading (`x-simulated-trading: 1`) | Yes | Yes | Yes |
| Public market endpoints | All pass | All pass | All pass |
| Private read endpoints | All pass | See below | All pass |

## Known Limitations by Site

### EEA (`eea.okx.com`)

| Endpoint | Status | Note |
|---|:---:|---|
| `swap_get_leverage` | `404` | `/api/v5/account/leverage-info` not available on EEA |

### US (`app.okx.com`)

| Endpoint | Status | Note |
|---|:---:|---|
| `account_get_max_size` | `51010` | Account mode restriction, not an endpoint issue |
| `account_get_max_avail_size` | `51010` | Same as above |

### Global (`www.okx.com`)

No known limitations. All read-only endpoints pass in both demo and live mode.

## Smoke Test Commands

```bash
# Global (demo)
pnpm tsx scripts/smoke-test/run.ts --profile demo --read-only

# US (demo)
pnpm tsx scripts/smoke-test/run.ts --profile us-demo --read-only

# EEA (demo)
pnpm tsx scripts/smoke-test/run.ts --profile eu-demo --read-only
```

---

# 站点兼容性

本文档汇总了三个 OKX 站点的 API 兼容性，基于对实盘/模拟盘账户的 smoke test 结果（只读模式）。

| | Global | EEA | US |
|---|:---:|:---:|:---:|
| API 域名 | `www.okx.com` | `eea.okx.com` | `app.okx.com` |
| 模拟盘（`x-simulated-trading: 1`）| 支持 | 支持 | 支持 |
| 公开行情接口 | 全部通过 | 全部通过 | 全部通过 |
| 私有只读接口 | 全部通过 | 见下方 | 全部通过 |

## 各站点已知限制

### EEA（`eea.okx.com`）

| 接口 | 状态 | 说明 |
|---|:---:|---|
| `swap_get_leverage` | `404` | EEA 站不提供 `/api/v5/account/leverage-info` |

### US（`app.okx.com`）

| 接口 | 状态 | 说明 |
|---|:---:|---|
| `account_get_max_size` | `51010` | 账户模式限制，非接口缺失 |
| `account_get_max_avail_size` | `51010` | 同上 |

### Global（`www.okx.com`）

无已知限制，所有只读接口在模拟盘和实盘下均正常。

## Smoke Test 命令

```bash
# Global（模拟盘）
pnpm tsx scripts/smoke-test/run.ts --profile demo --read-only

# US（模拟盘）
pnpm tsx scripts/smoke-test/run.ts --profile us-demo --read-only

# EEA（模拟盘）
pnpm tsx scripts/smoke-test/run.ts --profile eu-demo --read-only
```
