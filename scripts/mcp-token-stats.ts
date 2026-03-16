/**
 * MCP Tool Token Stats
 *
 * Analyses every registered MCP tool and prints a per-module breakdown of
 * JSON size and estimated token consumption.
 *
 * Usage:  npx tsx scripts/mcp-token-stats.ts
 */

import { buildTools } from "../packages/core/src/tools/index.ts";
import { MODULES } from "../packages/core/src/constants.ts";

interface ToolEntry {
  name: string;
  chars: number;
}

interface ModuleStat {
  count: number;
  chars: number;
  tools: ToolEntry[];
}

const config = { modules: [...MODULES], readOnly: false } as never;
const tools = buildTools(config);

const byModule: Record<string, ModuleStat> = {};
let totalChars = 0;

for (const t of tools) {
  const mcpTool = {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      readOnlyHint: !t.isWrite,
      destructiveHint: t.isWrite,
      idempotentHint: !t.isWrite,
      openWorldHint: true,
    },
  };
  const json = JSON.stringify(mcpTool);
  const chars = json.length;

  if (!byModule[t.module]) byModule[t.module] = { count: 0, chars: 0, tools: [] };
  byModule[t.module].count++;
  byModule[t.module].chars += chars;
  byModule[t.module].tools.push({ name: t.name, chars });
  totalChars += chars;
}

const rows = Object.entries(byModule).sort((a, b) => b[1].chars - a[1].chars);

console.log("| 模块 | 工具数 | JSON 字符 | 估算 tokens | 占比 |");
console.log("|------|--------|----------|------------|------|");
for (const [mod, info] of rows) {
  const tokens = Math.round(info.chars / 3.5);
  const pct = ((info.chars / totalChars) * 100).toFixed(1);
  console.log(
    `| ${mod} | ${info.count} | ${info.chars.toLocaleString()} | ~${tokens.toLocaleString()} | ${pct}% |`,
  );
}
console.log(
  `| **合计** | **${tools.length}** | **${totalChars.toLocaleString()}** | **~${Math.round(totalChars / 3.5).toLocaleString()}** | 100% |`,
);
console.log();
console.log(
  `平均每工具: ${Math.round(totalChars / tools.length)} chars, ~${Math.round(totalChars / tools.length / 3.5)} tokens`,
);
console.log();

console.log("### Top 10 最大工具");
console.log();
const allTools = Object.values(byModule)
  .flatMap((m) => m.tools)
  .sort((a, b) => b.chars - a.chars);
for (const t of allTools.slice(0, 10)) {
  console.log(`- \`${t.name}\` — ${t.chars} chars, ~${Math.round(t.chars / 3.5)} tokens`);
}

const roTools = buildTools({ modules: [...MODULES], readOnly: true } as never);
let roChars = 0;
for (const t of roTools) {
  roChars += JSON.stringify({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {},
  }).length;
}
console.log();
console.log("### readOnly 模式");
console.log(
  `readOnly=true: ${roTools.length} 工具, ~${Math.round(roChars / 3.5)} tokens (减少 ${tools.length - roTools.length} 个写操作工具)`,
);
