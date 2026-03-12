import { defineConfig } from "tsup";
import { execSync } from "node:child_process";

const gitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  sourcemap: true,
  clean: true,
  dts: false,
  noExternal: ["@agent-tradekit/core", "smol-toml"],
  external: ["undici"],
  banner: { js: "#!/usr/bin/env node" },
  define: { __GIT_HASH__: JSON.stringify(gitHash) },
});
