/**
 * Shared HTTP download utilities used by pilot/installer.ts and auth/installer.ts.
 */

import { createWriteStream, unlinkSync } from "node:fs";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";

export function isRedirect(statusCode: number | undefined): boolean {
  return statusCode !== undefined && statusCode >= 300 && statusCode < 400;
}

/**
 * Validate a redirect and return the resolved location, or throw on error.
 */
export function validateRedirect(
  res: import("node:http").IncomingMessage,
  requestUrl: string,
  redirectCount: number,
  maxRedirects: number,
): string {
  if (redirectCount > maxRedirects) {
    throw new Error(`Too many redirects (${maxRedirects})`);
  }
  const location = res.headers.location!;
  if (requestUrl.startsWith("https") && !location.startsWith("https")) {
    throw new Error("Refused HTTPS -> HTTP redirect downgrade");
  }
  return location;
}

export function fetchResponse(
  url: string,
  timeoutMs: number,
): Promise<import("node:http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const maxRedirects = 5;

    function doRequest(requestUrl: string): void {
      const reqFn = requestUrl.startsWith("https") ? httpsGet : httpGet;
      const req = reqFn(requestUrl, { timeout: timeoutMs }, (res) => {
        if (isRedirect(res.statusCode) && res.headers.location) {
          redirects++;
          try {
            const location = validateRedirect(res, requestUrl, redirects, maxRedirects);
            // Drain the redirect response body so the connection is returned to the pool.
            res.resume();
            doRequest(location);
          } catch (err) {
            reject(err);
          }
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode ?? "unknown"}`));
          return;
        }

        resolve(res);
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Download timed out"));
      });
    }

    doRequest(url);
  });
}

export function download(url: string, destPath: string, timeoutMs: number): Promise<void> {
  return fetchResponse(url, timeoutMs).then(
    (res) =>
      new Promise<void>((resolve, reject) => {
        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => {
          try { unlinkSync(destPath); } catch { /* ignore */ }
          reject(err);
        });
      }),
  );
}

export function downloadText(url: string, timeoutMs: number): Promise<string> {
  return fetchResponse(url, timeoutMs).then(
    (res) =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }),
  );
}
