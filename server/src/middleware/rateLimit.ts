import rateLimit from "express-rate-limit";
import { RedisRateLimitStore } from "./redisRateLimitStore.js";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore("rl:login:"),
});

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore("rl:webhook:"),
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore("rl:api:"),
});
