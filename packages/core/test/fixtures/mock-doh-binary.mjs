#!/usr/bin/env node
/**
 * Mock okx-doh-resolver binary for testing.
 *
 * Behavior is controlled by the --domain value:
 *   "proxy.okx.com"    → returns proxy node (1.1.1.1 / proxy1.com)
 *   "direct.okx.com"   → returns node matching hostname (direct detection)
 *   "fail.okx.com"     → returns code=1 (no available nodes)
 *   "multi.okx.com"    → returns different nodes based on --exclude list:
 *                      no exclude  → 1.1.1.1
 *                      exclude 1.1 → 2.2.2.2
 *                      exclude both → code=1 (exhausted)
 */

const args = process.argv.slice(2);
const domainIdx = args.indexOf("--domain");
const domain = domainIdx >= 0 ? args[domainIdx + 1] : "";
const excludeIdx = args.indexOf("--exclude");
const exclude = excludeIdx >= 0 ? args[excludeIdx + 1].split(",") : [];

function ok(ip, host, ttl = 300) {
  return JSON.stringify({ code: 0, data: { ip, host, ttl }, cached: false });
}

function fail(msg) {
  return JSON.stringify({ code: 1, data: { ip: "", host: "", ttl: 0 }, cached: false, msg });
}

let output;

switch (domain) {
  case "proxy.okx.com":
    output = ok("1.1.1.1", "proxy1.com", 300);
    break;

  case "direct.okx.com":
    // Binary returns node matching hostname → classifyAndCache detects direct
    output = ok("direct.okx.com", "direct.okx.com", 600);
    break;

  case "fail.okx.com":
    output = fail("no nodes available");
    break;

  case "multi.okx.com":
    if (exclude.includes("1.1.1.1") && exclude.includes("2.2.2.2")) {
      output = fail("all nodes exhausted");
    } else if (exclude.includes("1.1.1.1")) {
      output = ok("2.2.2.2", "proxy2.com", 120);
    } else {
      output = ok("1.1.1.1", "proxy1.com", 300);
    }
    break;

  default:
    output = fail("unknown domain");
}

process.stdout.write(output);
