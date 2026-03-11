/**
 * First-run security tips — shown once after install, then never again.
 *
 * Marker file: ~/.okx/.tips-shown
 * Tips are written to stderr so they don't interfere with JSON output.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function showFirstRunTips(version: string): void {
  const okxDir = join(homedir(), ".okx");
  const marker = join(okxDir, ".tips-shown");

  if (existsSync(marker)) return;

  const w = (s: string) => process.stderr.write(s);
  w("\n");
  w(`  @okx_ai/okx-trade-cli v${version}\n`);
  w("  ⚠️  Security Tips: NEVER send API keys in agent chat. Create a dedicated sub-account for your agent. Test on demo before going live.\n");
  w("  ⚠️  安全提示：切勿在Agent对话中发送API Key。请创建Agent专用子账户接入。先在模拟盘充分测试，再接入实盘。\n");
  w("\n");

  try {
    mkdirSync(okxDir, { recursive: true });
    writeFileSync(marker, new Date().toISOString() + "\n");
  } catch {
    // Best-effort — if we can't write the marker, tips show again next time.
  }
}
