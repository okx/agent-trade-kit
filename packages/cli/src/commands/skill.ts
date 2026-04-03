import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  type ToolRunner,
  type OkxConfig,
  OkxRestClient,
  downloadSkillZip,
  extractSkillZip,
  readMetaJson,
  validateSkillMdExists,
  upsertSkillRecord,
  removeSkillRecord,
  readSkillRegistry,
  getSkillRecord,
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

export async function cmdSkillAdd(
  name: string,
  config: OkxConfig,
  json: boolean,
): Promise<void> {
  const tmpBase = join(tmpdir(), `okx-skill-${randomUUID()}`);
  mkdirSync(tmpBase, { recursive: true });

  try {
    // Step 1: Download
    outputLine(`Downloading ${name}...`);
    const client = new OkxRestClient(config);
    const zipPath = await downloadSkillZip(client, name, tmpBase);

    // Step 2: Extract
    const contentDir = await extractSkillZip(zipPath, join(tmpBase, "content"));

    // Step 3: Validate
    const meta = readMetaJson(contentDir);
    validateSkillMdExists(contentDir);

    // Step 4: Install via npx skills add
    outputLine("Installing to detected agents...");
    try {
      execFileSync(resolveNpx(), ["skills", "add", contentDir, "-y", "-g"], {
        stdio: "inherit",
        timeout: 60_000,
      });
    } catch (e) {
      // Copy zip to cwd so the user has a fallback after tmpBase is cleaned up
      const savedZip = join(process.cwd(), `${name}.zip`);
      try { copyFileSync(zipPath, savedZip); } catch { /* best-effort */ }
      errorLine(`npx skills add failed. The zip has been downloaded but not installed.`);
      errorLine(`You can manually install from: ${savedZip}`);
      throw e;
    }

    // Step 5: Update registry
    upsertSkillRecord(meta);

    if (json) {
      outputLine(JSON.stringify({ name: meta.name, version: meta.version, status: "installed" }, null, 2));
    } else {
      outputLine(`✓ Skill "${meta.name}" v${meta.version} installed`);
    }
  } finally {
    // Step 6: Cleanup
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
): Promise<void> {
  outputLine(`Downloading ${name}...`);
  const client = new OkxRestClient(config);
  const filePath = await downloadSkillZip(client, name, targetDir);

  if (json) {
    outputLine(JSON.stringify({ name, filePath }, null, 2));
  } else {
    outputLine(`✓ Downloaded ${name}.zip`);
    outputLine(`  Path: ${filePath}`);
  }
}

// ---------------------------------------------------------------------------
// okx skill remove <name>
// ---------------------------------------------------------------------------

export function cmdSkillRemove(name: string, json: boolean): void {
  const removed = removeSkillRecord(name);

  if (!removed) {
    errorLine(`Skill "${name}" is not installed.`);
    process.exitCode = 1;
    return;
  }

  // Remove from all agent directories via npx skills remove
  try {
    execFileSync(resolveNpx(), ["skills", "remove", name, "-y", "-g"], {
      stdio: "inherit",
      timeout: 60_000,
    });
  } catch {
    // Fallback: manually remove .agents/skills/<name>/
    const agentsPath = join(homedir(), ".agents", "skills", name);
    try {
      rmSync(agentsPath, { recursive: true, force: true });
    } catch {
      // Ignore — cleanup is best-effort
    }
  }

  if (json) {
    outputLine(JSON.stringify({ name, status: "removed" }, null, 2));
  } else {
    outputLine(`✓ Skill "${name}" removed`);
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
    outputLine(`${name}: installed v${local.version} → latest v${remote.latestVersion} (up to date)`);
  } else {
    outputLine(`${name}: installed v${local.version} → latest v${remote.latestVersion} (update available)`);
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
