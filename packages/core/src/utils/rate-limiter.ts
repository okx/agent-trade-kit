import { RateLimitError } from "./errors.js";

type Bucket = {
  tokens: number;
  lastRefillMs: number;
  capacity: number;
  refillPerSecond: number;
};

export type RateLimitConfig = {
  key: string;
  capacity: number;
  refillPerSecond: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxWaitMs: number;
  private readonly verbose: boolean;

  public constructor(maxWaitMs = 30_000, verbose = false) {
    this.maxWaitMs = maxWaitMs;
    this.verbose = verbose;
  }

  public async consume(config: RateLimitConfig, amount = 1): Promise<void> {
    const bucket = this.getBucket(config);
    this.refill(bucket);

    if (bucket.tokens >= amount) {
      bucket.tokens -= amount;
      return;
    }

    const missing = amount - bucket.tokens;
    const secondsToWait = missing / bucket.refillPerSecond;
    const waitMs = Math.ceil(secondsToWait * 1000);

    if (waitMs > this.maxWaitMs) {
      throw new RateLimitError(
        `Client-side rate limit reached for ${config.key}. Required wait ${waitMs}ms exceeds allowed max ${this.maxWaitMs}ms.`,
        "Reduce tool call frequency or retry later.",
      );
    }

    if (this.verbose) {
      process.stderr.write(`[verbose] \u23F3 rate-limit: waiting ${waitMs}ms for "${config.key}"\n`);
    }
    await sleep(waitMs);
    this.refill(bucket);

    if (bucket.tokens < amount) {
      throw new RateLimitError(
        `Rate limiter failed to acquire enough tokens for ${config.key}.`,
      );
    }

    bucket.tokens -= amount;
  }

  private getBucket(config: RateLimitConfig): Bucket {
    const existing = this.buckets.get(config.key);
    if (existing) {
      if (
        existing.capacity !== config.capacity ||
        existing.refillPerSecond !== config.refillPerSecond
      ) {
        existing.capacity = config.capacity;
        existing.refillPerSecond = config.refillPerSecond;
        existing.tokens = Math.min(existing.tokens, config.capacity);
      }
      return existing;
    }

    const now = Date.now();
    const created: Bucket = {
      tokens: config.capacity,
      lastRefillMs: now,
      capacity: config.capacity,
      refillPerSecond: config.refillPerSecond,
    };
    this.buckets.set(config.key, created);
    return created;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefillMs;
    if (elapsedMs <= 0) {
      return;
    }

    const refillTokens = (elapsedMs / 1000) * bucket.refillPerSecond;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refillTokens);
    bucket.lastRefillMs = now;
  }
}
