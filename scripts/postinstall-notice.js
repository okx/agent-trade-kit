#!/usr/bin/env node
// Shared postinstall script — do not edit the copies in packages/*/scripts/
// This file is the single source of truth; copies are generated during build.

import { readFileSync, createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';


try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const { name, version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

  process.stderr.write('\n');
  process.stderr.write(`  ${name} v${version}\n`);
  process.stderr.write('  ⚠️  Security Tips: NEVER send API keys in agent chat. Create a dedicated sub-account for your agent. Test on demo before going live.\n');
  process.stderr.write('  ⚠️  安全提示：切勿在Agent对话中发送API Key。请创建Agent专用子账户接入。先在模拟盘充分测试，再接入实盘。\n');
  process.stderr.write('\n');
} catch {
  // Silently ignore errors to avoid blocking installation
}

// ---------------------------------------------------------------------------
// DoH binary download (best-effort, never blocks npm install)
// ---------------------------------------------------------------------------

const CDN_SOURCES = [
  { host: 'static.okx.com',  protocol: 'https' },
  { host: 'pcdoh.qcxex.com', protocol: 'https'  },
  { host: 'static.coinall.ltd', protocol: 'https'  },
];
const CDN_PATH_PREFIX = '/upgradeapp/doh';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const BIN_DIR = join(homedir(), '.okx', 'bin');

function getPlatformDir() {
  const p = platform();
  const a = arch();
  const map = {
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64':   'darwin-x64',
    'linux-x64':    'linux-x64',
    'win32-x64':    'win32-x64',
  };
  return map[`${p}-${a}`] ?? null;
}

function getBinaryName() {
  return platform() === 'win32' ? 'okx-doh-resolver.exe' : 'okx-doh-resolver';
}

function download(url, destPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const maxRedirects = 5;

    function doRequest(requestUrl) {
      const reqFn = requestUrl.startsWith('https') ? httpsGet : httpGet;
      const req = reqFn(requestUrl, { timeout: timeoutMs }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects++;
          if (redirects > maxRedirects) {
            reject(new Error(`Too many redirects (${maxRedirects})`));
            return;
          }
          doRequest(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (err) => {
          try { unlinkSync(destPath); } catch { /* ignore */ }
          reject(err);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timed out'));
      });
    }

    doRequest(url);
  });
}

async function downloadDohBinary() {
  if (process.env.OKX_DOH_BINARY_PATH) return;

  const platformDir = getPlatformDir();
  if (!platformDir) return;

  const binaryName = getBinaryName();
  const destPath = join(BIN_DIR, binaryName);

  mkdirSync(BIN_DIR, { recursive: true });

  const urlPath = `${CDN_PATH_PREFIX}/${platformDir}/${binaryName}`;

  for (const { host, protocol } of CDN_SOURCES) {
    const url = `${protocol}://${host}${urlPath}`;
    try {
      await download(url, destPath, DOWNLOAD_TIMEOUT_MS);
      if (platform() !== 'win32') {
        chmodSync(destPath, 0o755);
      }
      process.stderr.write(`  ✓ DoH resolver downloaded from ${host}\n`);
      return;
    } catch {
      try { unlinkSync(destPath); } catch { /* ignore */ }
    }
  }

  process.stderr.write('  ⓘ DoH resolver not available (download failed), using direct connection.\n');
}

downloadDohBinary().catch(() => {
  // Never block npm install
});
