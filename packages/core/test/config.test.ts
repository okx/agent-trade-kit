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
import { fileURLToPath } from "node:url";
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
  "OKX_AUTH_BIN",
  "MOCK_AUTH_EXIT",
  "MOCK_AUTH_STATUS_JSON",
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

  it("defaults to 'global' when no site is specified", async () => {
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.site, "global");
  });

  it("defaults baseUrl to global apiBaseUrl when site is global", async () => {
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.baseUrl, OKX_SITES.global.apiBaseUrl);
  });

  it("defaults verbose to false when not specified", async () => {
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.verbose, false);
  });
});

describe("loadConfig — site from CLI arg", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("uses site from cli.site", async () => {
    const config = await loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.site, "eea");
  });

  it("maps eea site to correct baseUrl", async () => {
    const config = await loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("maps us site to correct baseUrl", async () => {
    const config = await loadConfig({ ...BASE_CLI, site: "us" });
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("maps global site to correct baseUrl", async () => {
    const config = await loadConfig({ ...BASE_CLI, site: "global" });
    assert.equal(config.baseUrl, OKX_SITES.global.apiBaseUrl);
  });

  it("throws ConfigError for unknown site", async () => {
    await assert.rejects(
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

  it("uses OKX_SITE env var when cli.site is not set", async () => {
    process.env.OKX_SITE = "us";
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("cli.site takes precedence over OKX_SITE env var", async () => {
    process.env.OKX_SITE = "us";
    const config = await loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("throws ConfigError for invalid OKX_SITE env var", async () => {
    process.env.OKX_SITE = "bad-site";
    await assert.rejects(
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

  it("OKX_API_BASE_URL overrides site-derived baseUrl", async () => {
    process.env.OKX_API_BASE_URL = "https://custom.example.com";
    const config = await loadConfig({ ...BASE_CLI, site: "eea" });
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, "https://custom.example.com");
  });

  it("site is still correctly set even when OKX_API_BASE_URL overrides URL", async () => {
    process.env.OKX_API_BASE_URL = "https://custom.example.com";
    const config = await loadConfig({ ...BASE_CLI, site: "us" });
    assert.equal(config.site, "us");
  });
});

describe("loadConfig — site ConfigError suggestion", () => {
  let saved: SavedEnv;
  beforeEach(() => { saved = saveEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it("ConfigError for unknown site includes available site IDs in suggestion", async () => {
    await assert.rejects(
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

  it("trims whitespace from OKX_SITE env var", async () => {
    process.env.OKX_SITE = "  eea  ";
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("trims whitespace from cli.site arg", async () => {
    const config = await loadConfig({ ...BASE_CLI, site: "  us  " });
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

  it("uses site from toml profile when cli.site and OKX_SITE not set", async () => {
    writeToml('[profiles.default]\nsite = "eea"\n');
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.site, "eea");
    assert.equal(config.baseUrl, OKX_SITES.eea.apiBaseUrl);
  });

  it("cli.site takes precedence over toml site", async () => {
    writeToml('[profiles.default]\nsite = "eea"\n');
    const config = await loadConfig({ ...BASE_CLI, site: "us" });
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("OKX_SITE env var takes precedence over toml site", async () => {
    writeToml('[profiles.default]\nsite = "eea"\n');
    process.env.OKX_SITE = "us";
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.site, "us");
    assert.equal(config.baseUrl, OKX_SITES.us.apiBaseUrl);
  });

  it("falls back to 'global' when toml profile has no site field", async () => {
    writeToml('[profiles.default]\ndemo = false\n');
    const config = await loadConfig(BASE_CLI);
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

  it('"bot" expands to default bot sub-modules (bot.grid only)', async () => {
    const config = await loadConfig({ ...BASE_CLI, modules: "bot" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(!config.modules.includes("bot.dca" as never));
  });

  it('"bot.all" expands to all bot sub-modules (bot.grid + bot.dca)', async () => {
    const config = await loadConfig({ ...BASE_CLI, modules: "bot.all" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
  });

  it('"all" includes all bot sub-modules (bot.grid + bot.dca)', async () => {
    const config = await loadConfig({ ...BASE_CLI, modules: "all" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
    assert.ok(config.modules.includes("market" as never));
  });

  it('"all" includes earn sub-modules (earn.savings, earn.onchain, earn.dcd)', async () => {
    const config = await loadConfig({ ...BASE_CLI, modules: "all" });
    assert.ok(config.modules.includes("earn.savings" as never));
    assert.ok(config.modules.includes("earn.onchain" as never));
    assert.ok(config.modules.includes("earn.dcd" as never));
  });

  it('"all" still includes bot and base modules alongside earn', async () => {
    const config = await loadConfig({ ...BASE_CLI, modules: "all" });
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
    assert.ok(config.modules.includes("market" as never));
    assert.ok(config.modules.includes("spot" as never));
  });

  it("individual bot sub-modules can be selected", async () => {
    const config = await loadConfig({ ...BASE_CLI, modules: "spot,bot.dca" });
    assert.ok(config.modules.includes("spot" as never));
    assert.ok(config.modules.includes("bot.dca" as never));
    assert.ok(!config.modules.includes("bot.grid" as never));
  });

  it("default modules include option and bot.grid but not bot.dca", async () => {
    const config = await loadConfig(BASE_CLI);
    assert.ok(config.modules.includes("option" as never));
    assert.ok(config.modules.includes("bot.grid" as never));
    assert.ok(!config.modules.includes("bot.dca" as never));
  });

  it("unknown module throws ConfigError mentioning bot.all", async () => {
    await assert.rejects(
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

  it("reads proxy_url from toml profile", async () => {
    writeToml('[profiles.default]\nproxy_url = "http://127.0.0.1:7890"\n');
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "http://127.0.0.1:7890");
  });

  it("supports https proxy URL", async () => {
    writeToml('[profiles.default]\nproxy_url = "https://proxy.example.com:8080"\n');
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "https://proxy.example.com:8080");
  });

  it("supports authenticated proxy URL", async () => {
    writeToml('[profiles.default]\nproxy_url = "http://user:p%40ss@proxy.example.com:8080"\n');
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "http://user:p%40ss@proxy.example.com:8080");
  });

  it("proxyUrl is undefined when proxy_url not set in toml", async () => {
    writeToml('[profiles.default]\ndemo = false\n');
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, undefined);
  });

  it("throws ConfigError for SOCKS proxy URL", async () => {
    writeToml('[profiles.default]\nproxy_url = "socks5://127.0.0.1:1080"\n');
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("socks5://") &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("SOCKS"),
    );
  });

  it("throws ConfigError for proxy URL without scheme", async () => {
    writeToml('[profiles.default]\nproxy_url = "proxy.example.com:8080"\n');
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("proxy.example.com"),
    );
  });

  it("trims whitespace from proxy_url", async () => {
    writeToml('[profiles.default]\nproxy_url = "  http://127.0.0.1:7890  "\n');
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.proxyUrl, "http://127.0.0.1:7890");
  });

  it("treats empty string proxy_url as undefined", async () => {
    writeToml('[profiles.default]\nproxy_url = ""\n');
    const config = await loadConfig(BASE_CLI);
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

  it("throws ConfigError with quoting hint when passphrase has bare hash", async () => {
    writeToml('[profiles.default]\npassphrase = abc#123\n');
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("Failed to parse") &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("single quotes"),
    );
  });

  it("throws ConfigError with quoting hint when passphrase has bare backslash", async () => {
    writeToml('[profiles.default]\npassphrase = abc\\def\n');
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("okx config init"),
    );
  });

  it("parses passphrase with special chars when properly single-quoted", async () => {
    writeToml("[profiles.default]\npassphrase = 'abc#123\\\\def'\n");
    const config = readFullConfig();
    assert.equal(config.profiles.default.passphrase, "abc#123\\\\def");
  });

  it("parses passphrase with single quote when double-quoted", async () => {
    writeToml('[profiles.default]\npassphrase = "abc\'def"\n');
    const config = readFullConfig();
    assert.equal(config.profiles.default.passphrase, "abc'def");
  });

  it("parses passphrase with mixed special chars using triple quotes", async () => {
    writeToml("[profiles.default]\npassphrase = '''abc'#def'''\n");
    const config = readFullConfig();
    assert.equal(config.profiles.default.passphrase, "abc'#def");
  });

  it("suggestion mentions triple quotes for complex cases", async () => {
    writeToml('[profiles.default]\npassphrase = abc#\'def\n');
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        typeof err.suggestion === "string" &&
        err.suggestion.includes("triple quotes"),
    );
  });
});

// ---------------------------------------------------------------------------
// Demo / Live flag resolution
// ---------------------------------------------------------------------------

describe("loadConfig — demo/live flag resolution", () => {
  let saved: SavedEnv;
  let savedHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    saved = saveEnv();
    savedHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "okx-cfg-test-"));
    mkdirSync(join(tmpHome, ".okx"));
    writeFileSync(join(tmpHome, ".okx", "config.toml"), '[profiles.default]\n', "utf-8");
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

  it("defaults demo to false when no flag, no env, no toml", async () => {
    const config = await loadConfig({ readOnly: false });
    assert.equal(config.demo, false);
  });

  it("--demo sets demo to true", async () => {
    const config = await loadConfig({ readOnly: false, demo: true });
    assert.equal(config.demo, true);
  });

  it("--live sets demo to false", async () => {
    const config = await loadConfig({ readOnly: false, live: true });
    assert.equal(config.demo, false);
  });

  it("--demo and --live together throws ConfigError", async () => {
    await assert.rejects(
      () => loadConfig({ readOnly: false, demo: true, live: true }),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("mutually exclusive"),
    );
  });

  it("OKX_DEMO=1 sets demo to true when no CLI flag", async () => {
    process.env.OKX_DEMO = "1";
    const config = await loadConfig({ readOnly: false });
    assert.equal(config.demo, true);
  });

  it("--live overrides OKX_DEMO=1", async () => {
    process.env.OKX_DEMO = "1";
    const config = await loadConfig({ readOnly: false, live: true });
    assert.equal(config.demo, false);
  });
});

describe("loadConfig — demo/live with toml profile", () => {
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

  it("toml demo=true is used when no CLI flag", async () => {
    writeToml('[profiles.default]\ndemo = true\n');
    const config = await loadConfig({ readOnly: false });
    assert.equal(config.demo, true);
  });

  it("--live overrides toml demo=true", async () => {
    writeToml('[profiles.default]\ndemo = true\n');
    const config = await loadConfig({ readOnly: false, live: true });
    assert.equal(config.demo, false);
  });

  it("--demo overrides toml demo=false", async () => {
    writeToml('[profiles.default]\ndemo = false\n');
    const config = await loadConfig({ readOnly: false, demo: true });
    assert.equal(config.demo, true);
  });
});

// ---------------------------------------------------------------------------
// Partial API credentials & OAuth fallback
// ---------------------------------------------------------------------------

describe("loadConfig — partial API credentials", () => {
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

  it("throws ConfigError when only OKX_API_KEY is set", async () => {
    process.env.OKX_API_KEY = "some-key";
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("Partial API credentials"),
    );
  });

  it("throws ConfigError when only OKX_SECRET_KEY is set", async () => {
    process.env.OKX_SECRET_KEY = "some-secret";
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("Partial API credentials"),
    );
  });

  it("throws ConfigError when only OKX_PASSPHRASE is set", async () => {
    process.env.OKX_PASSPHRASE = "some-pass";
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("Partial API credentials"),
    );
  });

  it("throws ConfigError when two of three credentials are set", async () => {
    process.env.OKX_API_KEY = "some-key";
    process.env.OKX_SECRET_KEY = "some-secret";
    await assert.rejects(
      () => loadConfig(BASE_CLI),
      (err: unknown) =>
        err instanceof ConfigError &&
        err.message.includes("Partial API credentials"),
    );
  });
});

describe("loadConfig — OAuth fallback", () => {
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

  it("hasAuth=true when OAuth binary reports logged_in (no API key)", async () => {
    const mockBin = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "mock-auth-binary.mjs");
    process.env.OKX_AUTH_BIN = mockBin;
    process.env.MOCK_AUTH_EXIT = "0";
    process.env.MOCK_AUTH_STATUS_JSON = JSON.stringify({ status: "logged_in" });
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.hasAuth, true);
    assert.equal(config.apiKey, undefined);
  });

  it("hasAuth=false when OAuth binary is not available (no API key)", async () => {
    process.env.OKX_AUTH_BIN = "/nonexistent/path/okx-auth";
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.hasAuth, false);
  });

  it("hasAuth=true with API key regardless of OAuth status", async () => {
    process.env.OKX_API_KEY = "test-key";
    process.env.OKX_SECRET_KEY = "test-secret";
    process.env.OKX_PASSPHRASE = "test-pass";
    // Point to nonexistent binary — should not matter since API key takes priority
    process.env.OKX_AUTH_BIN = "/nonexistent/path/okx-auth";
    const config = await loadConfig(BASE_CLI);
    assert.equal(config.hasAuth, true);
  });
});
