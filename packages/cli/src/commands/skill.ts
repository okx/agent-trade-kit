import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  type ToolRunner,
  type OkxConfig,
  OkxRestClient,
  ConfigError,
  downloadSkillZip,
  extractSkillZip,
  readMetaJson,
  tryReadMetaJson,
  validateSkillMdExists,
  upsertSkillRecord,
  removeSkillRecord,
  readSkillRegistry,
  getSkillRecord,
  verifySkillSignature,
  getPublicKey,
  serverSideVerify,
  type VerificationResult,
} from "@agent-tradekit/core";
import { outputLine, errorLine } from "../formatter.js";

/**
 * Resolve the absolute path to `npx`.
 * Prefers the sibling of the current Node binary (most reliable, avoids PATH hijack).
 * Falls back to bare "npx" (OS PATH resolution) if the sibling doesn't exist.
 */
function resolveNpx(): string {
  const sibling = join(dirname(process.execPath), "npx");
  if (existsSync(sibling)) return sibling;
  return "npx";
}

/**
 * Build the env for child npm/npx invocations.
 *
 * Strips ANSI color output via NO_COLOR / FORCE_COLOR for any code path that
 * actually invokes npm/npx (notably `cmdSkillAdd` and `cmdSkillRemove`).
 * Exported so it can be exercised by unit tests.
 *
 * Note: NO_COLOR / FORCE_COLOR don't fully silence npm's own loglevel
 * output (`npm WARN exec ...`), which still emits ANSI cursor sequences
 * that trip the OKG sonar TAP lexer. Tests therefore inject a mock `exec`
 * rather than relying on env-var stripping alone.
 */
export function npxEnv(): NodeJS.ProcessEnv {
  return { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
}

/**
 * Subprocess executor type — `execFileSync` by default. Dependency-injected
 * so unit tests can substitute a no-op (or throwing) stub instead of
 * spawning real `npx skills add/remove`, which previously leaked ANSI
 * escape codes into the test TAP stream.
 */
export type SkillExec = typeof execFileSync;

/** Resolve the installed content directory for a skill. */
function getSkillContentDir(name: string): string {
  return join(homedir(), ".agents", "skills", name);
}

/** Notice shown after installing a third-party skill. */
export const THIRD_PARTY_INSTALL_NOTICE =
  "Note: This skill was created by a third-party developer, not by OKX. Review SKILL.md before use.";

// ---------------------------------------------------------------------------
// okx skill search <keyword>
// ---------------------------------------------------------------------------

export async function cmdSkillSearch(
  run: ToolRunner,
  opts: { keyword?: string; categories?: string; page?: string; limit?: string; json: boolean },
): Promise<void> {
  const args: Record<string, string> = {};
  if (opts.keyword) args.keyword = opts.keyword;
  if (opts.categories) args.categories = opts.categories;
  if (opts.page) args.page = opts.page;
  if (opts.limit) args.limit = opts.limit;

  const result = await run("skills_search", args);
  const data = result.data as unknown[];
  const totalPage = (result as unknown as Record<string, unknown>).totalPage as string | undefined;

  if (opts.json) {
    outputLine(JSON.stringify(result, null, 2));
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    outputLine("No skills found.");
    return;
  }

  outputLine("");
  outputLine("  NAME                VERSION   DESCRIPTION");
  for (const item of data as Array<{ name: string; latestVersion: string; description: string }>) {
    const name = (item.name ?? "").padEnd(20);
    const ver = (item.latestVersion ?? "").padEnd(10);
    const desc = (item.description ?? "").slice(0, 50);
    outputLine(`  ${name}${ver}${desc}`);
  }
  outputLine("");
  const page = opts.page ?? "1";
  const pageInfo = totalPage ? ` (page ${page}/${totalPage})` : "";
  outputLine(`${data.length} skills found${pageInfo}. Use \`okx skill add <name>\` to install.`);
}

// ---------------------------------------------------------------------------
// okx skill categories
// ---------------------------------------------------------------------------

export async function cmdSkillCategories(
  run: ToolRunner,
  json: boolean,
): Promise<void> {
  const result = await run("skills_get_categories", {});
  const data = result.data as unknown[];

  if (json) {
    outputLine(JSON.stringify(result, null, 2));
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    outputLine("No categories found.");
    return;
  }

  outputLine("");
  outputLine("  ID                  NAME");
  for (const cat of data as Array<{ categoryId: string; name: string }>) {
    outputLine(`  ${(cat.categoryId ?? "").padEnd(20)}${cat.name ?? ""}`);
  }
  outputLine("");
}

// ---------------------------------------------------------------------------
// okx skill add <name>
// ---------------------------------------------------------------------------

/** Injectable dependencies for cmdSkillAdd — used in tests to bypass network I/O. */
export interface SkillAddDeps {
  download?: (client: OkxRestClient, name: string, dir: string) => Promise<string>;
  extract?: (zipPath: string, dest: string) => Promise<string>;
}

/**
 * Run a verifySkillSignature call and surface ConfigError as a user-friendly message.
 * Extracts the ConfigError wrapping so callers can use `const result = await wrapVerify(...)`.
 */
async function wrapVerify(fn: () => Promise<VerificationResult>): Promise<VerificationResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConfigError) {
      throw new Error(
        `Signature verification requires authentication — run \`okx auth login\` first, or use --force to bypass.`,
      );
    }
    throw e;
  }
}

export async function cmdSkillAdd(
  name: string,
  config: OkxConfig,
  json: boolean,
  force = false,
  exec: SkillExec = execFileSync,
  _deps?: SkillAddDeps,
): Promise<void> {
  const _download = _deps?.download ?? downloadSkillZip;
  const _extract = _deps?.extract ?? extractSkillZip;

  const tmpBase = join(tmpdir(), `okx-skill-${randomUUID()}`);
  mkdirSync(tmpBase, { recursive: true });

  try {
    // Step 1: Download
    outputLine(`Downloading ${name}...`);
    const client = new OkxRestClient(config);
    const zipPath = await _download(client, name, tmpBase);

    // Step 2: Extract
    const contentDir = await _extract(zipPath, join(tmpBase, "content"));

    // Step 3: Validate
    const meta = readMetaJson(contentDir);
    validateSkillMdExists(contentDir);

    // Step 4: Verify signature (before install to avoid dirty state on failure)
    outputLine("Verifying signature...");
    const verifyResult = await wrapVerify(() =>
      verifySkillSignature(contentDir, meta.signing, {
        fetchPublicKey: (keyId) => getPublicKey(client, keyId),
        serverSideVerify: (sName, version, files) => serverSideVerify(client, sName, version, files),
        skillName: meta.name,
        skillVersion: meta.version,
      }),
    );

    if (verifyResult.status === "failed") {
      if (!force) {
        throw new Error(`Signature verification failed: ${verifyResult.error ?? "unknown error"}. Use --force to install anyway.`);
      }
      // Always write bypass warning to stderr regardless of --json, so scripted consumers can detect it
      process.stderr.write(`WARNING: Signature verification failed — ${verifyResult.error ?? "unknown"}. Installing anyway (--force).\n`);
    } else if (verifyResult.status === "verified_by_server") {
      if (!json) {
        outputLine(`  Verified by server (v${verifyResult.serverVersion ?? "?"})`);
        if (verifyResult.error) outputLine(`  Note: ${verifyResult.error}`);
      }
    } else if (!json) {
      outputLine(`  Signature verified (key: ${verifyResult.publicKeyId}, files: ${verifyResult.filesChecked})`);
      if (verifyResult.extraFiles?.length) {
        outputLine(`  Note: ${verifyResult.extraFiles.length} extra unsigned file(s) present`);
      }
    }

    // Step 5: Install via npx skills add
    outputLine("Installing to detected agents...");
    try {
      exec(resolveNpx(), ["skills", "add", contentDir, "-y", "-g"], {
        stdio: "inherit",
        timeout: 60_000,
        env: npxEnv(),
      });
    } catch (e) {
      // Copy zip to cwd so the user has a fallback after tmpBase is cleaned up
      const savedZip = join(process.cwd(), `${name}.zip`);
      try { copyFileSync(zipPath, savedZip); } catch { /* best-effort */ }
      errorLine(`npx skills add failed. The zip has been downloaded but not installed.`);
      errorLine(`You can manually install from: ${savedZip}`);
      throw e;
    }

    // Step 6: Update registry — use "bypassed" when user forced past a failed verification
    const registryStatus = (verifyResult.status === "failed" && force) ? "bypassed" : verifyResult.status;
    upsertSkillRecord(meta, undefined, registryStatus);

    printSkillInstallResult(meta, json);
  } finally {
    // Step 7: Cleanup
    rmSync(tmpBase, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// okx skill download <name>
// ---------------------------------------------------------------------------

export async function cmdSkillDownload(
  name: string,
  targetDir: string,
  config: OkxConfig,
  json: boolean,
  format: "zip" | "skill" = "zip",
): Promise<void> {
  outputLine(`Downloading ${name}...`);
  const client = new OkxRestClient(config);
  const filePath = await downloadSkillZip(client, name, targetDir, format);

  if (json) {
    outputLine(JSON.stringify({ name, filePath }, null, 2));
  } else {
    outputLine(`✓ Downloaded ${name}.${format}`);
    outputLine(`  Path: ${filePath}`);
  }
}

// ---------------------------------------------------------------------------
// okx skill remove <name>
// ---------------------------------------------------------------------------

export function cmdSkillRemove(name: string, json: boolean, exec: SkillExec = execFileSync): void {
  const removed = removeSkillRecord(name);

  if (!removed) {
    errorLine(`Skill "${name}" is not installed.`);
    process.exitCode = 1;
    return;
  }

  // Remove from all agent directories via npx skills remove
  try {
    exec(resolveNpx(), ["skills", "remove", name, "-y", "-g"], {
      stdio: "inherit",
      timeout: 60_000,
      env: npxEnv(),
    });
  } catch {
    // Fallback: manually remove .agents/skills/<name>/
    const agentsPath = getSkillContentDir(name);
    try {
      rmSync(agentsPath, { recursive: true, force: true });
    } catch {
      // Ignore - cleanup is best-effort
    }
  }

  if (json) {
    outputLine(JSON.stringify({ name, status: "removed" }, null, 2));
  } else {
    outputLine(`[ok] Skill "${name}" removed`);
  }
}

// ---------------------------------------------------------------------------
// okx skill check <name>
// ---------------------------------------------------------------------------

export async function cmdSkillCheck(
  run: ToolRunner,
  name: string,
  json: boolean,
): Promise<void> {
  const local = getSkillRecord(name);
  if (!local) {
    errorLine(`Skill "${name}" is not installed.`);
    process.exitCode = 1;
    return;
  }

  const result = await run("skills_search", { keyword: name });
  const data = result.data as Array<{ name: string; latestVersion: string }>;
  const remote = data?.find((s) => s.name === name);

  if (!remote) {
    errorLine(`Skill "${name}" not found in marketplace.`);
    process.exitCode = 1;
    return;
  }

  const upToDate = local.version === remote.latestVersion;

  if (json) {
    outputLine(JSON.stringify({
      name,
      installedVersion: local.version,
      latestVersion: remote.latestVersion,
      upToDate,
    }, null, 2));
  } else if (upToDate) {
    outputLine(`${name}: installed v${local.version} -> latest v${remote.latestVersion} (up to date)`);
  } else {
    outputLine(`${name}: installed v${local.version} -> latest v${remote.latestVersion} (update available)`);
    outputLine(`  Use \`okx skill add ${name}\` to update.`);
  }
}

// ---------------------------------------------------------------------------
// okx skill list
// ---------------------------------------------------------------------------

export function cmdSkillList(json: boolean): void {
  const registry = readSkillRegistry();
  const skills = Object.values(registry.skills);

  if (json) {
    outputLine(JSON.stringify(registry, null, 2));
    return;
  }

  if (skills.length === 0) {
    outputLine("No skills installed.");
    return;
  }

  outputLine("");
  outputLine("  NAME                VERSION   INSTALLED AT");
  for (const s of skills) {
    const name = s.name.padEnd(20);
    const ver = s.version.padEnd(10);
    const date = s.installedAt.slice(0, 19).replace("T", " ");
    outputLine(`  ${name}${ver}${date}`);
  }
  outputLine("");
  outputLine(`${skills.length} skills installed.`);
}

// ---------------------------------------------------------------------------
// okx skill verify <name>
// ---------------------------------------------------------------------------

export async function cmdSkillVerify(
  name: string,
  config: OkxConfig,
  json: boolean,
): Promise<void> {
  const record = getSkillRecord(name);
  if (!record) {
    errorLine(`Skill "${name}" is not installed.`);
    process.exitCode = 1;
    return;
  }

  const contentDir = getSkillContentDir(name);
  if (!existsSync(contentDir)) {
    errorLine(`Skill content directory not found: ${contentDir}`);
    errorLine(`Try reinstalling with: okx skill add ${name}`);
    process.exitCode = 1;
    return;
  }

  const meta = tryReadMetaJson(contentDir);
  const client = new OkxRestClient(config);

  let result: VerificationResult;
  try {
    result = await wrapVerify(() =>
      verifySkillSignature(contentDir, meta?.signing, {
        fetchPublicKey: (keyId) => getPublicKey(client, keyId),
        serverSideVerify: (sName, version, files) => serverSideVerify(client, sName, version, files),
        skillName: name,
        skillVersion: meta?.version,
      }),
    );
  } catch (e) {
    errorLine(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }

  // Persist updated verification status
  if (meta) {
    upsertSkillRecord(meta, undefined, result.status);
  }

  // Set exitCode before the JSON early-return so scripted consumers can detect failure
  // via exit code even when --json suppresses the human-readable error line.
  if (result.status === "failed") {
    process.exitCode = 1;
  }

  if (json) {
    outputLine(JSON.stringify(result, null, 2));
    return;
  }

  if (result.status === "verified") {
    outputLine(`✓ ${name}: signature verified (key: ${result.publicKeyId}, files: ${result.filesChecked})`);
    if (result.extraFiles?.length) {
      outputLine(`  Note: ${result.extraFiles.length} extra unsigned file(s) present`);
    }
  } else if (result.status === "verified_by_server") {
    outputLine(`✓ ${name}: verified by server (v${result.serverVersion ?? "?"})`);
    if (result.error) outputLine(`  Note: ${result.error}`);
  } else if (result.status === "failed") {
    errorLine(`✗ ${name}: verification failed — ${result.error ?? "unknown"}`);
  }
  // "bypassed" is only set by cmdSkillAdd (--force); verifySkillSignature never returns it.
  // The empty else is intentional: a future VerificationStatus addition won't silently pass.
}

// ---------------------------------------------------------------------------
// Install result output (extracted for testability)
// ---------------------------------------------------------------------------

/** Format and output the install-success message. */
export function printSkillInstallResult(
  meta: { name: string; version: string },
  json: boolean,
): void {
  if (json) {
    outputLine(JSON.stringify({ name: meta.name, version: meta.version, status: "installed" }, null, 2));
  } else {
    outputLine(`✓ Skill "${meta.name}" v${meta.version} installed`);
    outputLine(`  ${THIRD_PARTY_INSTALL_NOTICE}`);
  }
}
