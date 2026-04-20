#!/usr/bin/env node
// Shared postinstall script — do not edit the copies in packages/*/scripts/
// This file is the single source of truth; copies are generated during build.

import { readFileSync, createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  { host: 'static.jingyunyilian.com', protocol: 'https'  },
  { host: 'static.okx.com',  protocol: 'https' },
  { host: 'static.coinall.ltd', protocol: 'https'  },
];
const CDN_PATH_PREFIX = '/upgradeapp/tools/doh';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const BIN_DIR = join(homedir(), '.okx', 'bin');

function getPlatformDir() {
  const p = platform();
  const a = arch();
  const map = {
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64':   'darwin-x64',
    'linux-arm64':  'linux-arm64',
    'linux-x64':    'linux-x64',
    'win32-arm64':  'win32-x64',    // fallback: x64 binary via WoW64 emulation
    'win32-x64':    'win32-x64',
  };
  return map[`${p}-${a}`] ?? null;
}

function getBinaryName() {
  return platform() === 'win32' ? 'okx-pilot.exe' : 'okx-pilot';
}

/**
 * Low-level HTTP GET with redirect + timeout handling.
 * Returns the IncomingMessage (status 200) for the caller to consume.
 */
function fetchResponse(url, timeoutMs) {
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
          const location = res.headers.location;
          if (requestUrl.startsWith('https') && !location.startsWith('https')) {
            reject(new Error('Refused HTTPS → HTTP redirect downgrade'));
            return;
          }
          doRequest(location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        resolve(res);
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

function download(url, destPath, timeoutMs) {
  return fetchResponse(url, timeoutMs).then((res) => new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', (err) => {
      try { unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  }));
}

function downloadText(url, timeoutMs) {
  return fetchResponse(url, timeoutMs).then((res) => new Promise((resolve, reject) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    res.on('error', reject);
  }));
}

/**
 * Read a file and return its size + SHA-256 hex digest in one pass.
 */
function hashFile(filePath) {
  const buf = readFileSync(filePath);
  return { size: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex') };
}

/**
 * Verify a local binary against checksum metadata.
 * Returns true if sha256, size, and target all match.
 */
function verifyBinary(filePath, checksum, platformDir) {
  try {
    const { size, sha256 } = hashFile(filePath);
    if (size !== checksum.size) return false;
    if (checksum.target !== platformDir) return false;
    return sha256 === checksum.sha256;
  } catch {
    return false;
  }
}

async function downloadDohBinary() {
  if (process.env.OKX_DOH_BINARY_PATH) return;

  const platformDir = getPlatformDir();
  if (!platformDir) return;

  const binaryName = getBinaryName();
  const destPath = join(BIN_DIR, binaryName);
  const tmpPath = destPath + '.tmp';

  mkdirSync(BIN_DIR, { recursive: true });

  const checksumPath = `${CDN_PATH_PREFIX}/${platformDir}/checksum.json`;
  const binaryPath = `${CDN_PATH_PREFIX}/${platformDir}/${binaryName}`;

  for (const { host, protocol } of CDN_SOURCES) {
    try {
      // Step 1: Download checksum.json
      const checksumUrl = `${protocol}://${host}${checksumPath}`;
      const raw = await downloadText(checksumUrl, DOWNLOAD_TIMEOUT_MS);
      const checksum = JSON.parse(raw);

      if (!checksum.sha256 || !checksum.size || !checksum.target) {
        throw new Error('Invalid checksum.json: missing sha256, size, or target');
      }

      if (checksum.target !== platformDir) {
        throw new Error(`Target mismatch: expected ${platformDir}, got ${checksum.target}`);
      }

      // If local binary already matches, skip download
      if (existsSync(destPath) && verifyBinary(destPath, checksum, platformDir)) {
        process.stderr.write('  ✓ DoH resolver up to date (checksum match)\n');
        return;
      }

      // Download binary to temp file
      const binaryUrl = `${protocol}://${host}${binaryPath}`;
      await download(binaryUrl, tmpPath, DOWNLOAD_TIMEOUT_MS);

      // Verify checksum (single read: size + sha256)
      const actual = hashFile(tmpPath);
      if (actual.size !== checksum.size) {
        throw new Error(`Size mismatch: expected ${checksum.size}, got ${actual.size}`);
      }
      if (actual.sha256 !== checksum.sha256) {
        throw new Error(`SHA-256 mismatch: expected ${checksum.sha256}, got ${actual.sha256}`);
      }

      // Atomic replace — Windows may hold a lock on the old binary; remove it first
      try { unlinkSync(destPath); } catch { /* ignore */ }
      renameSync(tmpPath, destPath);

      if (platform() !== 'win32') {
        chmodSync(destPath, 0o755);
      }

      process.stderr.write(`  ✓ DoH resolver downloaded and verified (${host})\n`);
      return;
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      process.stderr.write(`  [doh] ${host} failed: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  process.stderr.write('  ⓘ DoH resolver not available (download or verification failed), using direct connection.\n');
}

downloadDohBinary().catch(() => {
  // Never block npm install
});
