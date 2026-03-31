export interface DohNode {
  /** Proxy node IP address */
  ip: string;
  /** Proxy hostname (used for Host header / TLS SNI) */
  host: string;
  /** Cache TTL in seconds */
  ttl: number;
}
