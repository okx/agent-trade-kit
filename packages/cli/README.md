# okx-cli

## English

Command line tool for OKX. Supports market data, account queries, spot and swap
trading, and configuration management.

### Install

```bash
npm install -g okx-cli
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

### Quick usage

```bash
okx market ticker BTC-USDT
okx market orderbook BTC-USDT --sz 5
okx account balance
okx spot orders
okx swap positions
```

### Examples

```bash
okx market candles BTC-USDT --bar 1H --limit 10
okx account balance BTC,ETH
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
```

For more details, see the repository README.

---

## 中文

OKX 命令行工具，支持行情、账户查询、现货与合约交易，以及配置管理。

### 安装

```bash
npm install -g okx-cli
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

### 快速使用

```bash
okx market ticker BTC-USDT
okx market orderbook BTC-USDT --sz 5
okx account balance
okx spot orders
okx swap positions
```

### 示例

```bash
okx market candles BTC-USDT --bar 1H --limit 10
okx account balance BTC,ETH
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
```

更多说明请参考仓库根目录 README。
