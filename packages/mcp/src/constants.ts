import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const pkg = _require("../package.json") as { version: string };

export const SERVER_NAME = "okx-trade-mcp";
export const SERVER_VERSION = pkg.version;
