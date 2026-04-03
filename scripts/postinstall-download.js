#!/usr/bin/env node
/**
 * postinstall-download.js
 *
 * Downloads the platform-specific okx-doh-resolver binary from OKX CDN
 * to ~/.okx/bin/.  Two-layer CDN fallback:
 *   1. static.okx.com   (HTTPS, overseas)
 *   2. pcdoh.qcxex.com  (HTTP, domestic)
 *
 * This script MUST NOT block npm install — all errors are silently swallowed.
 * If the binary cannot be downloaded the SDK falls back to direct connection.
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { join } from 'node:path';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CDN_SOURCES = [
  { host: 'static.okx.com',  protocol: 'https' },
  { host: 'pcdoh.qcxex.com', protocol: 'http'  },
];
const CDN_PATH_PREFIX = '/upgradeapp/doh/prepub';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const BIN_DIR = join(homedir(), '.okx', 'bin');

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function getPlatformDir() {
  const p = platform();
  const a = arch();

  const map = {
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64':   'darwin-x64',
    'linux-x64':    'linux-x64',
    'win32-x64':    'win32-x64',
  };

  const key = `${p}-${a}`;
  return map[key] ?? null;
}

function getBinaryName() {
  return platform() === 'win32' ? 'okx-doh-resolver.exe' : 'okx-doh-resolver';
}

// ---------------------------------------------------------------------------
// Download helper (follows up to 5 redirects)
// ---------------------------------------------------------------------------

function download(url, destPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const maxRedirects = 5;
    const getter = url.startsWith('https') ? httpsGet : httpGet;

    function doRequest(requestUrl) {
      const reqFn = requestUrl.startsWith('https') ? httpsGet : getter;
      const req = reqFn(requestUrl, { timeout: timeoutMs }, (res) => {
        // Follow redirects
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Skip if OKX_DOH_BINARY_PATH is set (user manages their own binary)
  if (process.env.OKX_DOH_BINARY_PATH) return;

  const platformDir = getPlatformDir();
  if (!platformDir) {
    // Unsupported platform — silently skip
    return;
  }

  const binaryName = getBinaryName();
  const destPath = join(BIN_DIR, binaryName);

  // Skip if binary already exists
  if (existsSync(destPath)) return;

  // Ensure target directory exists
  mkdirSync(BIN_DIR, { recursive: true });

  const urlPath = `${CDN_PATH_PREFIX}/${platformDir}/${binaryName}`;

  for (const { host, protocol } of CDN_SOURCES) {
    const url = `${protocol}://${host}${urlPath}`;
    try {
      await download(url, destPath, DOWNLOAD_TIMEOUT_MS);
      // Make executable on Unix
      if (platform() !== 'win32') {
        chmodSync(destPath, 0o755);
      }
      process.stderr.write(`  ✓ DoH resolver downloaded from ${host}\n`);
      return;
    } catch {
      // Remove partial download
      try { unlinkSync(destPath); } catch { /* ignore */ }
      // Try next CDN source
    }
  }

  // All CDN hosts failed — silently degrade
  process.stderr.write('  ⓘ DoH resolver not available (download failed), using direct connection.\n');
}

main().catch(() => {
  // Never block npm install
});
