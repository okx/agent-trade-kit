#!/usr/bin/env node

// ---------------------------------------------------------------------------
// Copy the okx-auth binary into dist/bin/ for npm distribution.
//
// Called by CLI and MCP build scripts after tsup:
//   node ../../scripts/copy-auth-bin.mjs
//
// Resolution order:
//   1. CI build output: ../../dist/<platform>/okx-auth[.exe]
//   2. Dev fallback:    ../../bin/okx-auth[.exe]
//   3. Neither found → warn and skip (non-fatal)
// ---------------------------------------------------------------------------

import { copyFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Platform key: matches the Rust build output directory names
const PLATFORM_MAP = {
  "darwin-arm64": { dir: "darwin-arm64", bin: "okx-auth" },
  "darwin-x64":   { dir: "darwin-x64",   bin: "okx-auth" },
  "linux-x64":    { dir: "linux-x64",    bin: "okx-auth" },
  "win32-x64":    { dir: "win32-x64",    bin: "okx-auth.exe" },
};

const platformKey = `${process.platform}-${process.arch}`;
const target = PLATFORM_MAP[platformKey];

if (!target) {
  console.warn(`[copy-auth-bin] Unsupported platform: ${platformKey} — skipping binary copy`);
  process.exit(0);
}

// 1. CI build output (platform-specific)
const ciBin = join(REPO_ROOT, "dist", target.dir, target.bin);

// 2. Dev fallback (single binary at repo root)
const devBin = join(REPO_ROOT, "bin", target.bin);

const source = existsSync(ciBin) ? ciBin : existsSync(devBin) ? devBin : null;

if (!source) {
  console.warn(`[copy-auth-bin] okx-auth binary not found for ${platformKey}`);
  console.warn(`  Checked: ${ciBin}`);
  console.warn(`  Checked: ${devBin}`);
  console.warn("  Skipping — auth commands will require OKX_AUTH_BIN env var at runtime");
  process.exit(0);
}

// Copy into dist/bin/ (relative to cwd, which is the package directory)
const destDir = join(process.cwd(), "dist", "bin");
const dest = join(destDir, target.bin);

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
chmodSync(dest, 0o755);

console.log(`[copy-auth-bin] ${source} → ${dest}`);
