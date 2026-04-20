#!/usr/bin/env node
/**
 * Mock okx-pilot binary for testing.
 *
 * Behavior is controlled by the --domain value:
 *   "proxy.okx.com"    → returns proxy node (192.0.2.1 / proxy1.com)
 *   "direct.okx.com"   → returns node matching hostname (direct detection)
 *   "cdnhost.okx.com"  → returns CDN ip with original hostname as host (proxy, not direct)
 *   "fail.okx.com"     → returns code=1 (no available nodes)
 *   "multi.okx.com"    → returns different nodes based on --exclude list:
 *                      no exclude  → 192.0.2.1
 *                      exclude 192.0.2.1 → 198.51.100.2
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
    output = ok("192.0.2.1", "proxy1.com", 300);
    break;

  case "direct.okx.com":
    // Binary returns node matching hostname → classifyAndCache detects direct
    output = ok("direct.okx.com", "direct.okx.com", 600);
    break;

  case "cdnhost.okx.com":
    // CDN ip but host equals original hostname — should be proxy, not direct
    output = ok("d1a9ug9i3w9ke0.cloudfront.net", "cdnhost.okx.com", 30);
    break;

  case "fail.okx.com":
    output = fail("no nodes available");
    break;

  case "multi.okx.com":
    if (exclude.includes("192.0.2.1") && exclude.includes("198.51.100.2")) {
      output = fail("all nodes exhausted");
    } else if (exclude.includes("192.0.2.1")) {
      output = ok("198.51.100.2", "proxy2.com", 120);
    } else {
      output = ok("192.0.2.1", "proxy1.com", 300);
    }
    break;

  default:
    output = fail("unknown domain");
}

process.stdout.write(output);
