import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/testing.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  sourcemap: true,
  clean: true,
  dts: true,
});
