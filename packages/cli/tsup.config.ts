import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  sourcemap: true,
  clean: true,
  dts: false,
  noExternal: ["@agent-tradekit/core"],
  banner: { js: "#!/usr/bin/env node" },
});
