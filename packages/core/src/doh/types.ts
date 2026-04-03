/** A resolved DoH proxy node returned by the okx-doh-resolver binary. */
export interface DohNode {
  /** Proxy node IP address (e.g. "47.242.161.22") */
  ip: string;
  /** Proxy hostname for Host header / TLS SNI (e.g. "okexweb.qqhrss.com") */
  host: string;
  /** Cache TTL in seconds */
  ttl: number;
}

/** Raw JSON output from the okx-doh-resolver binary. */
export interface DohBinaryResponse {
  code: number;
  data?: DohNode;
}
