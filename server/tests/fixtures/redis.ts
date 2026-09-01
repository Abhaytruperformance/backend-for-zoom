import { Redis } from "ioredis";

let cached: boolean | null = null;
let client: Redis | null = null;

function getClient(): Redis {
  if (!client) client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null, lazyConnect: true });
  return client;
}

/** Same auto-skip convention as fixtures/db.ts — tests using this should be safe to run with no Redis reachable. */
export async function isRedisAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await getClient().ping();
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

export async function redisDel(key: string): Promise<void> {
  await getClient().del(key);
}
