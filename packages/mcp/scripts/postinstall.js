#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { name, version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

process.stderr.write('\n');
process.stderr.write(`  ${name} v${version}\n`);
process.stderr.write('  ⚠️  Security Tips: NEVER send API keys in agent chat. Create a dedicated sub-account for your agent. Test on demo before going live.\n');
process.stderr.write('  ⚠️  安全提示：切勿在Agent对话中发送API Key。请创建Agent专用子账户接入。先在模拟盘充分测试，再接入实盘。\n');
process.stderr.write('\n');
