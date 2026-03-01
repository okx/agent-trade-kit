import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/utils/rate-limiter.js";
import { RateLimitError } from "../src/utils/errors.js";

const cfg = (key = "test", capacity = 5, refillPerSecond = 10) => ({
  key,
  capacity,
  refillPerSecond,
});

describe("RateLimiter", () => {
  it("allows consuming up to capacity without waiting", async () => {
    const limiter = new RateLimiter();
    const config = cfg("burst", 5, 10);
    for (let i = 0; i < 5; i++) {
      await limiter.consume(config); // should not throw or delay
    }
  });

  it("throws RateLimitError when maxWaitMs is too small", async () => {
    // 1 token/s refill, 0 capacity left → needs ~1000ms wait but maxWaitMs=10
    const limiter = new RateLimiter(10);
    const config = cfg("slow", 1, 1);
    await limiter.consume(config); // drains the single token
    await assert.rejects(
      () => limiter.consume(config),
      (err: unknown) => {
        assert.ok(err instanceof RateLimitError);
        assert.equal(err.type, "RateLimitError");
        return true;
      },
    );
  });

  it("independent keys do not interfere with each other", async () => {
    const limiter = new RateLimiter();
    const a = cfg("key-a", 2, 10);
    const b = cfg("key-b", 2, 10);
    await limiter.consume(a);
    await limiter.consume(a);
    // key-b still has full capacity
    await limiter.consume(b);
    await limiter.consume(b);
  });

  it("refills tokens over time", async () => {
    // Use a high refill rate so the wait is short in CI
    const limiter = new RateLimiter(2000);
    const config = cfg("fast-refill", 1, 500); // 500 tokens/s → 2ms per token
    await limiter.consume(config); // drain
    // After consuming, wait briefly and consume again — should succeed
    await new Promise((r) => setTimeout(r, 10));
    await limiter.consume(config); // should refill and succeed
  });

  it("updates bucket config when capacity changes", async () => {
    const limiter = new RateLimiter();
    const config1 = { key: "dynamic", capacity: 10, refillPerSecond: 10 };
    await limiter.consume(config1);

    // Now use same key with smaller capacity
    const config2 = { key: "dynamic", capacity: 2, refillPerSecond: 10 };
    await limiter.consume(config2); // should not throw
  });
});
