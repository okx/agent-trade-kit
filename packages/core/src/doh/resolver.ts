import { dohBinaryExists, execDohBinary } from "./binary.js";
import type { DohNode } from "./types.js";

/**
 * Resolve a domain to the fastest DoH proxy node via the okx-doh-resolver binary.
 *
 * Returns null (graceful fallback to direct connection) when:
 *  - The binary is not installed
 *  - The binary call fails or times out
 *  - The binary returns a non-zero code
 *
 * @param domain - The hostname to resolve (e.g. "www.okx.com")
 */
export async function resolveDoh(domain: string): Promise<DohNode | null> {
  if (!await dohBinaryExists()) {
    return null;
  }
  return execDohBinary(domain);
}
