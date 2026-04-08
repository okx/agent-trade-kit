#!/usr/bin/env node
/**
 * Mock okx-doh-resolver binary for testing.
 *
 * Behavior is controlled by the --domain value:
 *   "proxy.test"    → returns proxy node (1.1.1.1 / proxy1.com)
 *   "direct.test"   → returns node matching hostname (direct detection)
 *   "fail.test"     → returns code=1 (no available nodes)
 *   "multi.test"    → returns different nodes based on --exclude list:
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
  case "proxy.test":
    output = ok("1.1.1.1", "proxy1.com", 300);
    break;

  case "direct.test":
    // Binary returns node matching hostname → classifyAndCache detects direct
    output = ok("direct.test", "direct.test", 600);
    break;

  case "fail.test":
    output = fail("no nodes available");
    break;

  case "multi.test":
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
