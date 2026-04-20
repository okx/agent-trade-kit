import { createHmac } from "node:crypto";

export function getNow(): string {
  return new Date().toISOString();
}

export function signOkxPayload(payload: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(payload).digest("base64");
}
