import { createRequire } from "node:module";

declare const __GIT_HASH__: string;

const _require = createRequire(import.meta.url);
const pkg = _require("../package.json") as { version: string };

export const SERVER_NAME = "okx-trade-mcp";
export const SERVER_VERSION = pkg.version;
export const GIT_HASH: string = typeof __GIT_HASH__ !== "undefined" ? __GIT_HASH__ : "dev";
