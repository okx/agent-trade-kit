import { writeFullConfig } from "@agent-tradekit/core";
import type { OkxTomlConfig } from "@agent-tradekit/core";

export function writeCliConfig(config: OkxTomlConfig): void {
  writeFullConfig(config);
}
