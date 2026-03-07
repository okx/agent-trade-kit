[English](README.md) | [中文](README.zh-CN.md)

# okx-trade-cli

Command line tool for OKX. Supports market data, account queries, spot and swap
trading, and configuration management.

### Install

```bash
npm install -g @okx_ai/okx-trade-cli
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

For more details, see the [repository README](../../README.md).
