import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LogLevel = "error" | "warn" | "info" | "debug";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const SENSITIVE_KEY_PATTERN = /apiKey|secretKey|passphrase|password|secret/i;

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = sanitize(v);
      }
    }
    return result;
  }
  return value;
}

const PRUNE_MARKER = ".last-prune.json";
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const MS_PER_DAY = 86400000;
const LOG_FILE_PATTERN = /^trade-.+\.log$/;

export function pruneOldLogs(logDir: string, retentionDays: number, now: number): void {
  if (retentionDays === 0) return;
  try {
    const markerPath = path.join(logDir, PRUNE_MARKER);
    let checkedAt = 0;
    try {
      const raw = fs.readFileSync(markerPath, "utf8");
      const data = JSON.parse(raw) as { checkedAt?: unknown };
      if (typeof data.checkedAt === "number") {
        checkedAt = data.checkedAt;
      }
    } catch {
      // absent or corrupt — sweep unconditionally
    }
    if (checkedAt > 0 && now - checkedAt <= PRUNE_INTERVAL_MS) return;
    const cutoff = now - retentionDays * MS_PER_DAY;
    for (const name of fs.readdirSync(logDir).filter((f) => LOG_FILE_PATTERN.test(f))) {
      try {
        if (fs.statSync(path.join(logDir, name)).mtimeMs < cutoff) {
          fs.unlinkSync(path.join(logDir, name));
        }
      } catch {
        // per-file error swallowed
      }
    }
    fs.writeFileSync(markerPath, JSON.stringify({ checkedAt: now }), "utf8");
  } catch {
    // entire sweep is best-effort
  }
}

export interface LogEntry {
  timestamp: string;
  level: Uppercase<LogLevel>;
  tool: string;
  durationMs: number;
  params: unknown;
  result: unknown;
}

export class TradeLogger {
  private readonly logLevel: LogLevel;
  private readonly logDir: string;

  constructor(logLevel: LogLevel = "info", logDir?: string) {
    this.logLevel = logLevel;
    this.logDir = logDir ?? path.join(os.homedir(), ".okx", "logs");
    const parsed = parseInt(process.env.OKX_LOG_RETENTION_DAYS ?? "", 10);
    const retentionDays = isNaN(parsed) || parsed < 0 ? DEFAULT_RETENTION_DAYS : parsed;
    pruneOldLogs(this.logDir, retentionDays, Date.now());
  }

  getLogPath(date?: Date): string {
    const d = date ?? new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return path.join(this.logDir, `trade-${yyyy}-${mm}-${dd}.log`);
  }

  log(
    level: LogLevel,
    tool: string,
    params: unknown,
    result: unknown,
    durationMs: number,
  ): void {
    if (LOG_LEVEL_PRIORITY[level] > LOG_LEVEL_PRIORITY[this.logLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase() as Uppercase<LogLevel>,
      tool,
      durationMs,
      params: sanitize(params),
      result: sanitize(result),
    };

    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      fs.appendFileSync(this.getLogPath(), JSON.stringify(entry) + "\n", "utf8");
    } catch {
      // silent fail
    }
  }

  static sanitize(params: unknown): unknown {
    return sanitize(params);
  }
}
