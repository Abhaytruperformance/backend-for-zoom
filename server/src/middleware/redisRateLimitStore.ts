import { Redis } from "ioredis";
import type { Store, IncrementResponse, Options } from "express-rate-limit";
import { config } from "../config.js";

// Deliberately a separate connection from queue.ts's redisConnection — that one is shared with
// BullMQ Workers, which hold it on blocking commands (BRPOPLPUSH/BLMPOP) while waiting for jobs.
// Sharing it here would risk a rate-limit check stalling behind an in-flight blocking pop,
// especially under RUN_WORKER_INLINE where API + workers share one process.
const client = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Redis-backed express-rate-limit store. The default in-memory store only tracks hits within
 * one process — fine on Render's current single instance, silently wrong (each instance gets
 * its own independent limit) the moment this scales past one. Counts are shared across every
 * process talking to the same Redis instead.
 *
 * One instance per rate limiter, each with its own key prefix — otherwise two limiters keyed
 * by the same client (e.g. both default to IP) would collide on the same Redis key and share
 * a counter that should be independent.
 */
export class RedisRateLimitStore implements Store {
  windowMs = 60_000;
  prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = this.prefix + key;
    const totalHits = await client.incr(redisKey);
    if (totalHits === 1) {
      // Only the request that just created the key sets its expiry — an INCR on an existing
      // key must never refresh the TTL, or a busy key's window would slide forward forever.
      await client.pexpire(redisKey, this.windowMs);
    }
    const ttl = await client.pttl(redisKey);
    return { totalHits, resetTime: ttl > 0 ? new Date(Date.now() + ttl) : undefined };
  }

  async decrement(key: string): Promise<void> {
    await client.decr(this.prefix + key);
  }

  async resetKey(key: string): Promise<void> {
    await client.del(this.prefix + key);
  }
}
