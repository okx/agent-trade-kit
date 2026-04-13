import { spawn } from "node:child_process";
import { getAuthBinaryPath } from "@agent-tradekit/core";
import { errorLine } from "../formatter.js";
import type { CliValues } from "../parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spawn okx-auth with inherited stdio and wait for exit. */
function runOkxAuth(args: string[]): Promise<number> {
  const binPath = getAuthBinaryPath();

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn okx-auth: ${err.message}`));
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

/** Spawn okx-auth, pipe stdout to caller's stdout, inherit stderr + stdin. */
function runOkxAuthCapture(args: string[]): Promise<{ code: number; stdout: string }> {
  const binPath = getAuthBinaryPath();

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const chunks: Buffer[] = [];
    child.stdout!.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn okx-auth: ${err.message}`));
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(chunks).toString("utf-8"),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// okx auth login
// ---------------------------------------------------------------------------

export interface AuthLoginArgs {
  site?: string;
  manual?: boolean;
}

export async function cmdAuthLogin(args: AuthLoginArgs): Promise<void> {
  const cliArgs = ["login"];
  if (args.site) cliArgs.push("--site", args.site);
  if (args.manual) cliArgs.push("--manual");

  const code = await runOkxAuth(cliArgs);
  if (code !== 0) {
    process.exitCode = code;
  }
}

// ---------------------------------------------------------------------------
// okx auth logout
// ---------------------------------------------------------------------------

export async function cmdAuthLogout(): Promise<void> {
  const code = await runOkxAuth(["logout"]);
  if (code !== 0) {
    process.exitCode = code;
  }
}

// ---------------------------------------------------------------------------
// okx auth status
// ---------------------------------------------------------------------------

export interface AuthStatusArgs {
  json?: boolean;
}

export async function cmdAuthStatus(args: AuthStatusArgs): Promise<void> {
  const cliArgs = ["status"];
  if (args.json) cliArgs.push("--json");

  const result = await runOkxAuthCapture(cliArgs);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.code !== 0) {
    process.exitCode = result.code;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function handleAuthCommand(
  action: string,
  _rest: string[],
  v: CliValues,
): Promise<void> | void {
  const site = v.site;
  const json = v.json;
  const manual = v.manual;

  switch (action) {
    case "login":
      return cmdAuthLogin({ site, manual });
    case "logout":
      return cmdAuthLogout();
    case "status":
      return cmdAuthStatus({ json });
    default:
      errorLine(`Unknown auth command: ${action}`);
      errorLine("Available: login, logout, status");
      process.exitCode = 1;
  }
}
