import { describe, expect, it } from "vitest";

const { isRedisAvailable, redisDel } = await import("../fixtures/redis.js");
const { RedisRateLimitStore } = await import("../../src/middleware/redisRateLimitStore.js");

const redisAvailable = await isRedisAvailable();

// A short window keeps this fast without needing to wait out a real rate-limit window.
const WINDOW_MS = 500;

describe.skipIf(!redisAvailable)("RedisRateLimitStore", () => {
  it("increments the hit count across successive calls for the same key", async () => {
    const store = new RedisRateLimitStore("rl:test:count:");
    store.init({ windowMs: WINDOW_MS } as any);
    const key = `k-${Date.now()}-${Math.random()}`;

    const first = await store.increment(key);
    const second = await store.increment(key);
    const third = await store.increment(key);

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(third.totalHits).toBe(3);

    await redisDel(`rl:test:count:${key}`);
  });

  it("two different keys get independent counters", async () => {
    const store = new RedisRateLimitStore("rl:test:independent:");
    store.init({ windowMs: WINDOW_MS } as any);
    const keyA = `a-${Date.now()}`;
    const keyB = `b-${Date.now()}`;

    await store.increment(keyA);
    await store.increment(keyA);
    const resultB = await store.increment(keyB);

    expect(resultB.totalHits).toBe(1); // unaffected by keyA's hits

    await redisDel(`rl:test:independent:${keyA}`);
    await redisDel(`rl:test:independent:${keyB}`);
  });

  it("resetKey brings the count back to 1 on the next increment", async () => {
    const store = new RedisRateLimitStore("rl:test:reset:");
    store.init({ windowMs: WINDOW_MS } as any);
    const key = `r-${Date.now()}`;

    await store.increment(key);
    await store.increment(key);
    await store.resetKey(key);
    const after = await store.increment(key);

    expect(after.totalHits).toBe(1);

    await redisDel(`rl:test:reset:${key}`);
  });

  it("the count expires after the window, not sooner and not indefinitely", async () => {
    const store = new RedisRateLimitStore("rl:test:expiry:");
    store.init({ windowMs: WINDOW_MS } as any);
    const key = `e-${Date.now()}`;

    const first = await store.increment(key);
    expect(first.resetTime).toBeInstanceOf(Date);
    // Roughly matches the configured window, not some unrelated default.
    expect(first.resetTime!.getTime() - Date.now()).toBeGreaterThan(0);
    expect(first.resetTime!.getTime() - Date.now()).toBeLessThanOrEqual(WINDOW_MS + 50);

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 100));
    const afterExpiry = await store.increment(key);
    expect(afterExpiry.totalHits).toBe(1); // window rolled over — this is a fresh count, not 2

    await redisDel(`rl:test:expiry:${key}`);
  });

  it("decrement lowers the count without resetting the window", async () => {
    const store = new RedisRateLimitStore("rl:test:decrement:");
    store.init({ windowMs: WINDOW_MS } as any);
    const key = `d-${Date.now()}`;

    await store.increment(key);
    await store.increment(key);
    await store.decrement(key);
    const after = await store.increment(key);

    expect(after.totalHits).toBe(2); // 1 + 1 - 1 + 1

    await redisDel(`rl:test:decrement:${key}`);
  });
});
