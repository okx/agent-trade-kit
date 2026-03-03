import type { ToolSpec } from "../types.js";
import { registerGridTools } from "./grid.js";

export function registerBotTools(): ToolSpec[] {
  return [...registerGridTools()];
}
