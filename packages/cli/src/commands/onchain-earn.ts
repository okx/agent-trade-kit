import type { ToolRunner } from "@agent-tradekit/core";
import type { CliValues } from "../parser.js";

export function cmdOnchainEarnOffers(run: ToolRunner, v: CliValues) {
  return run("onchain_earn_get_offers", {
    productId: v.productId,
    protocolType: v.protocolType,
    ccy: v.ccy,
  });
}

export function cmdOnchainEarnPurchase(run: ToolRunner, v: CliValues) {
  // Parse investData from ccy + amt flags
  const investData = v.ccy && v.amt ? [{ ccy: v.ccy, amt: v.amt }] : undefined;
  return run("onchain_earn_purchase", {
    productId: v.productId,
    investData,
    term: v.term,
    tag: v.tag,
  });
}

export function cmdOnchainEarnRedeem(run: ToolRunner, v: CliValues) {
  return run("onchain_earn_redeem", {
    ordId: v.ordId,
    protocolType: v.protocolType,
    allowEarlyRedeem: v.allowEarlyRedeem,
  });
}

export function cmdOnchainEarnCancel(run: ToolRunner, v: CliValues) {
  return run("onchain_earn_cancel", {
    ordId: v.ordId,
    protocolType: v.protocolType,
  });
}

export function cmdOnchainEarnActiveOrders(run: ToolRunner, v: CliValues) {
  return run("onchain_earn_get_active_orders", {
    productId: v.productId,
    protocolType: v.protocolType,
    ccy: v.ccy,
    state: v.state,
  });
}

export function cmdOnchainEarnOrderHistory(run: ToolRunner, v: CliValues) {
  return run("onchain_earn_get_order_history", {
    productId: v.productId,
    protocolType: v.protocolType,
    ccy: v.ccy,
  });
}
