/**
 * Unit tests for loadConfig — site parsing and URL mapping.
 *
 * Env var isolation: each test saves/restores the relevant env vars.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { readFullConfig } from "../src/config/toml.js";
import { OKX_SITES } from "../src/constants.js";
import { ConfigError } from "../src/utils/errors.js";

// ---------------------------------------------------------------------------
// Env var helpers
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "OKX_SITE",
  "OKX_API_BASE_URL",
  "OKX_API_KEY",
  "OKX_SECRET_KEY",
  "OKX_PASSPHRASE",
  "OKX_DEMO",
  "OKX_TIMEOUT_MS",
] as const;

type SavedEnv = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function saveEnv(): SavedEnv {
  const saved: SavedEnv = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restoreEnv(saved: SavedEnv): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

// ---------------------------------------------------------------------------
// Base CLI options
// ---------------------------------------------------------------------------

const BASE_CLI = {
  readOnly: false,
  demo: false,
};

// ---------------------------------------------------------------------------
// Site parsing
// ---------------------------------------------------------------------------

describe("loadConfig — site defaults", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("defaults to 'global' when no site is specified", () => {
    const config = loadConfig(BASE_CLI);
    assert.equal(config.site, "global");
  });

  it("defaults baseUrl to global apiBaseUrl when site is global", () => {
    const config = loadConfig(BASE_CLI);
    assert.equal(config.baseUrl, OKX_SITES.global.apiBaseUrl);
  });

  it("defaults verbose to false when not specified", () => {
    const config = loadConfig(BASE_CLI);
    assert.equal(config.verbose, false);
  });
});

describe("loadConfig — site from CLI arg", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("uses site from cli.site", () => {
    const config = loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.site, "eea");
  });

  it("maps eea site to correct baseUrl", () => {
    const config = loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("maps us site to correct baseUrl", () => {
    const config = loadConfig({ ...BASE_CLI, site: "us" });
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("maps global site to correct baseUrl", () => {
    const config = loadConfig({ ...BASE_CLI, site: "global" });
    assert.equal(config.baseUrl, OKX_SITES.global.apiBaseUrl);
  });

  it("throws ConfigError for unknown site", () => {
    assert.throws(
      () => loadConfig({ ...BASE_CLI, site: "invalid-site" }),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("invalid-site"),
    );
  });
});

describe("loadConfig — site from env var", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("uses OKX_SITE env var when cli.site is not set", () => {
    process.env.OKX_SITE = "us";
    const config = loadConfig(BASE_CLI);
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("cli.site takes precedence over OKX_SITE env var", () => {
    process.env.OKX_SITE = "us";
    const config = loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("throws ConfigError for invalid OKX_SITE env var", () => {
    process.env.OKX_SITE = "bad-site";
    assert.throws(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("bad-site"),
    );
  });
});

describe("loadConfig — OKX_API_BASE_URL overrides site mapping", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("OKX_API_BASE_URL overrides site-derived baseUrl", () => {
    process.env.OKX_API_BASE_URL = "https://custom.example.com";
    const config = loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, "https://custom.example.com");
  });

  it("site is still correctly set even when OKX_API_BASE_URL overrides URL", () => {
    process.env.OKX_API_BASE_URL = "https://custom.example.com";
    const config = loadConfig({ ...BASE_CLI, site: "us" });
    assert.equal(config.site, "us");
  });
});

describe("loadConfig — site ConfigError suggestion", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("ConfigError for unknown site includes available site IDs in suggestion", () => {
    assert.throws(
      () => loadConfig({ ...BASE_CLI, site: "xyz" }),
      (err: unknown) =>
        err instanceof ConfigError &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("global") &&
        err.suggestion.includes("eea") &&
        err.suggestion.includes("us"),
    );
  });
});

// ---------------------------------------------------------------------------
// Whitespace trimming
// ---------------------------------------------------------------------------

describe("loadConfig — site whitespace trimming", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("trims whitespace from OKX_SITE env var", () => {
    process.env.OKX_SITE = "  eea  ";
    const config = loadConfig(BASE_CLI);
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("trims whitespace from cli.site arg", () => {
    const config = loadConfig({ ...BASE_CLI, site: "  us  " });
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });
});

// ---------------------------------------------------------------------------
// Site from toml profile
// ---------------------------------------------------------------------------

describe("loadConfig — site from toml profile", () => {
  let saved: SavedEnv;
  let savedHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    saved = saveEnv();
    savedHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "okx-cfg-test-"));
    mkdirSync(join(tmpHome, ".okx"));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    restoreEnv(saved);
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeToml(content: string): void {
    writeFileSync(join(tmpHome, ".okx", "config.toml"), content, "utf-8");
  }

  it("uses site from toml profile when cli.site and OKX_SITE not set", () => {
    writeToml('[profiles.default]\nsite = "eea"\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("cli.site takes precedence over toml site", () => {
    writeToml('[profiles.default]\nsite = "eea"\n');
    const config = loadConfig({ ...BASE_CLI, site: "us" });
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("OKX_SITE env var takes precedence over toml site", () => {
    writeToml('[profiles.default]\nsite = "eea"\n');
    process.env.OKX_SITE = "us";
    const config = loadConfig(BASE_CLI);
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("falls back to 'global' when toml profile has no site field", () => {
    writeToml('[profiles.default]\ndemo = false\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.site, "global");
  });
});

// ---------------------------------------------------------------------------
// Bot sub-module parsing
// ---------------------------------------------------------------------------

describe("loadConfig — bot sub-modules", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => restoreEnv(saved));

  it('"bot" expands to default bot sub-modules (bot.grid only)', () => {
    const config = loadConfig({ ...BASE_CLI, modules: "bot" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(!config.modules.includes("bot.dca" as never));
  });

  it('"bot.all" expands to all bot sub-modules (bot.grid + bot.dca)', () => {
    const config = loadConfig({ ...BASE_CLI, modules: "bot.all" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
  });

  it('"all" includes all bot sub-modules (bot.grid + bot.dca)', () => {
    const config = loadConfig({ ...BASE_CLI, modules: "all" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
    assert.ok(config.modules.includes("market" as never));
  });

  it('"all" includes earn sub-modules (earn.savings, earn.onchain, earn.dcd)', () => {
    const config = loadConfig({ ...BASE_CLI, modules: "all" });
    assert.ok(config.modules.includes("earn.savings" as never));
    assert.ok(config.modules.includes("earn.onchain" as never));
    assert.ok(config.modules.includes("earn.dcd" as never));
  });

  it('"all" still includes bot and base modules alongside earn', () => {
    const config = loadConfig({ ...BASE_CLI, modules: "all" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
    assert.ok(config.modules.includes("market" as never));
    assert.ok(config.modules.includes("spot" as never));
  });

  it("individual bot sub-modules can be selected", () => {
    const config = loadConfig({ ...BASE_CLI, modules: "spot,bot.dca" });
    assert.ok(config.modules.includes("spot" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
    assert.ok(!config.modules.includes("bot.grid" as never));
  });

  it("default modules include option and bot.grid but not bot.dca", () => {
    const config = loadConfig(BASE_CLI);
    assert.ok(config.modules.includes("option" as never));
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(!config.modules.includes("bot.dca" as never));
  });

  it("unknown module throws ConfigError mentioning bot.all", () => {
    assert.throws(
      () => loadConfig({ ...BASE_CLI, modules: "invalid-module" }),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.suggestion?.includes("bot.all"),
    );
  });
});

// ---------------------------------------------------------------------------
// Proxy URL from toml profile
// ---------------------------------------------------------------------------

describe("loadConfig — proxy_url from toml profile", () => {
  let saved: SavedEnv;
  let savedHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    saved = saveEnv();
    savedHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "okx-cfg-test-"));
    mkdirSync(join(tmpHome, ".okx"));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    restoreEnv(saved);
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeToml(content: string): void {
    writeFileSync(join(tmpHome, ".okx", "config.toml"), content, "utf-8");
  }

  it("reads proxy_url from toml profile", () => {
    writeToml('[profiles.default]\nproxy_url = "http://127.0.0.1:7890"\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "http://127.0.0.1:7890");
  });

  it("supports https proxy URL", () => {
    writeToml('[profiles.default]\nproxy_url = "https://proxy.example.com:8080"\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "https://proxy.example.com:8080");
  });

  it("supports authenticated proxy URL", () => {
    writeToml('[profiles.default]\nproxy_url = "http://user:p%40ss@proxy.example.com:8080"\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "http://user:p%40ss@proxy.example.com:8080");
  });

  it("proxyUrl is undefined when proxy_url not set in toml", () => {
    writeToml('[profiles.default]\ndemo = false\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, undefined);
  });

  it("throws ConfigError for SOCKS proxy URL", () => {
    writeToml('[profiles.default]\nproxy_url = "socks5://127.0.0.1:1080"\n');
    assert.throws(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("socks5://") &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("SOCKS"),
    );
  });

  it("throws ConfigError for proxy URL without scheme", () => {
    writeToml('[profiles.default]\nproxy_url = "proxy.example.com:8080"\n');
    assert.throws(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("proxy.example.com"),
    );
  });

  it("trims whitespace from proxy_url", () => {
    writeToml('[profiles.default]\nproxy_url = "  http://127.0.0.1:7890  "\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "http://127.0.0.1:7890");
  });

  it("treats empty string proxy_url as undefined", () => {
    writeToml('[profiles.default]\nproxy_url = ""\n');
    const config = loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, undefined);
  });
});

// ---------------------------------------------------------------------------
// TOML parse error — special characters in passphrase
// ---------------------------------------------------------------------------

describe("loadConfig — TOML parse error for special characters", () => {
  let saved: SavedEnv;
  let savedHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    saved = saveEnv();
    savedHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "okx-cfg-test-"));
    mkdirSync(join(tmpHome, ".okx"));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    restoreEnv(saved);
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeToml(content: string): void {
    writeFileSync(join(tmpHome, ".okx", "config.toml"), content, "utf-8");
  }

  it("throws ConfigError with quoting hint when passphrase has bare hash", () => {
    writeToml('[profiles.default]\npassphrase = abc#123\n');
    assert.throws(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("Failed to parse") &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("single quotes"),
    );
  });

  it("throws ConfigError with quoting hint when passphrase has bare backslash", () => {
    writeToml('[profiles.default]\npassphrase = abc\\def\n');
    assert.throws(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("okx config init"),
    );
  });

  it("parses passphrase with special chars when properly single-quoted", () => {
    writeToml("[profiles.default]\npassphrase = 'abc#123\\\\def'\n");
    const config = readFullConfig();
    assert.equal(config.profiles.default.passphrase, "abc#123\\\\def");
  });

  it("parses passphrase with single quote when double-quoted", () => {
    writeToml('[profiles.default]\npassphrase = "abc\'def"\n');
    const config = readFullConfig();
    assert.equal(config.profiles.default.passphrase, "abc'def");
  });

  it("parses passphrase with mixed special chars using triple quotes", () => {
    writeToml("[profiles.default]\npassphrase = '''abc'#def'''\n");
    const config = readFullConfig();
    assert.equal(config.profiles.default.passphrase, "abc'#def");
  });

  it("suggestion mentions triple quotes for complex cases", () => {
    writeToml('[profiles.default]\npassphrase = abc#\'def\n');
    assert.throws(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("triple quotes"),
    );
  });
});
