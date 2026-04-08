#!/bin/bash
CLI="node $(dirname "$0")/../packages/cli/dist/index.js"

check() {
  local name=$1 instId=${2:-BTC-USDT} bar=${3:-1H} params=$4
  local args="market indicator $name $instId --bar $bar --demo --json"
  [ -n "$params" ] && args="$args --params $params"

  result=$($CLI $args 2>&1)
  has_data=$(echo "$result" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  tf=d[0]['data'][0]['timeframes']
  for t,tv in tf.items():
    for ind,arr in tv['indicators'].items():
      if arr:
        vals=arr[0].get('values','')
        print('OK  ' + str(vals)[:80])
        sys.exit()
  print('EMPTY')
except Exception as e:
  print('ERR:'+str(e)[:60])
" 2>/dev/null)
  printf "  %-22s %s\n" "$name" "$has_data"
}

echo "=== Moving Averages ==="
check ma      BTC-USDT 1H "5,20"
check ema     BTC-USDT 1H "10,20"
check wma     BTC-USDT 1H "20"
check dema    BTC-USDT 1H "20"
check tema    BTC-USDT 1H "20"
check zlema   BTC-USDT 1H "20"
check hma     BTC-USDT 1H "20"
check kama    BTC-USDT 1H "20"

echo ""
echo "=== Trend ==="
check macd        BTC-USDT 1H
check supertrend  BTC-USDT 1H
check sar         BTC-USDT 1H
check adx         BTC-USDT 1H
check aroon       BTC-USDT 1H
check cci         BTC-USDT 1H
check dpo         BTC-USDT 1H

echo ""
echo "=== Ichimoku ==="
check tenkan  BTC-USDT 1H
check kijun   BTC-USDT 1H
check senkoa  BTC-USDT 1H
check senkob  BTC-USDT 1H
check chikou  BTC-USDT 1H

echo ""
echo "=== Momentum ==="
check rsi      BTC-USDT 1H
check stochrsi BTC-USDT 1H
check kdj      BTC-USDT 1H
check wr       BTC-USDT 1H
check stoch    BTC-USDT 1H
check roc      BTC-USDT 1H
check mom      BTC-USDT 1H
check ppo      BTC-USDT 1H
check trix     BTC-USDT 1H
check ao       BTC-USDT 1H
check uo       BTC-USDT 1H
check fisher   BTC-USDT 1H

echo ""
echo "=== Volatility ==="
check bb        BTC-USDT 1H
check boll      BTC-USDT 1H
check atr       BTC-USDT 1H
check bbwidth   BTC-USDT 1H
check bbpct     BTC-USDT 1H
check keltner   BTC-USDT 1H
check donchian  BTC-USDT 1H
check massindex BTC-USDT 1H
check hv        BTC-USDT 1H
check stddev    BTC-USDT 1H
check tr        BTC-USDT 1H
check stderr    BTC-USDT 1H

echo ""
echo "=== Volume ==="
check obv    BTC-USDT 1H
check vwap   BTC-USDT 1H
check mvwap  BTC-USDT 1H
check cmf    BTC-USDT 1H
check mfi    BTC-USDT 1H
check nvipvi BTC-USDT 1H
check ad     BTC-USDT 1H
check cho    BTC-USDT 1H

echo ""
echo "=== Statistics ==="
check lr       BTC-USDT 1H
check slope    BTC-USDT 1H
check angle    BTC-USDT 1H
check variance BTC-USDT 1H
check meandev  BTC-USDT 1H
check sigma    BTC-USDT 1H

echo ""
echo "=== Price Auxiliary ==="
check tp BTC-USDT 1H
check mp BTC-USDT 1H

echo ""
echo "=== Candlestick Patterns ==="
check doji            BTC-USDT 1H
check bullengulf      BTC-USDT 1H
check bearengulf      BTC-USDT 1H
check bullharami      BTC-USDT 1H
check bearharami      BTC-USDT 1H
check bullharamicross BTC-USDT 1H
check bearharamicross BTC-USDT 1H
check threesoldiers   BTC-USDT 1H
check threecrows      BTC-USDT 1H
check ushadow         BTC-USDT 1H
check lshadow         BTC-USDT 1H
check realbody        BTC-USDT 1H
check hangingman      BTC-USDT 1H
check invertedh       BTC-USDT 1H
check shootingstar    BTC-USDT 1H

echo ""
echo "=== Trend / Composite / Filter ==="
check envelope     BTC-USDT 1H "20"
check halftrend    BTC-USDT 1H
check alphatrend   BTC-USDT 1H
check pmax         BTC-USDT 1H
check waddah       BTC-USDT 1H
check tdi          BTC-USDT 1H
check qqe          BTC-USDT 1H
check range-filter BTC-USDT 1H

echo ""
echo "=== BTC Crypto Cycle ==="
check rainbow         BTC-USDT 1Dutc
check ahr999          BTC-USDT 1Dutc
check pi-cycle-top    BTC-USDT 1Dutc
check pi-cycle-bottom BTC-USDT 1Dutc
check mayer           BTC-USDT 1Dutc
