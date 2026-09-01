import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

export const redisConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE_NAMES = {
  PROCESS_TRANSCRIPT: "processTranscript",
  POLL_TRANSCRIPT: "pollTranscriptFallback",
  SEND_EMAIL: "sendEmail",
  ZOOM_COMPANY_SYNC: "zoomCompanySync",
} as const;

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7 },
  removeOnFail: { age: 60 * 60 * 24 * 30 },
};

export const processTranscriptQueue = new Queue(QUEUE_NAMES.PROCESS_TRANSCRIPT, {
  connection: redisConnection,
  defaultJobOptions,
});

export const pollTranscriptQueue = new Queue(QUEUE_NAMES.POLL_TRANSCRIPT, {
  connection: redisConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 6, backoff: { type: "exponential", delay: 2 * 60 * 1000 } },
});

export const sendEmailQueue = new Queue(QUEUE_NAMES.SEND_EMAIL, {
  connection: redisConnection,
  defaultJobOptions,
});

// No retry backoff here — a failed sync run just tries again on the next scheduled tick.
export const zoomCompanySyncQueue = new Queue(QUEUE_NAMES.ZOOM_COMPANY_SYNC, {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { age: 60 * 60 * 24 * 7 }, removeOnFail: { age: 60 * 60 * 24 * 30 } },
});

/**
 * One deterministic jobId per meeting so BullMQ refuses a duplicate enqueue while one is
 * in flight/waiting. Each queue is already its own namespace, so no extra prefix is needed
 * — and BullMQ rejects custom job IDs containing ":" (it uses that internally for Redis
 * key construction), so the meeting/snapshot id is used bare.
 */
export function meetingJobId(meetingId: string): string {
  return meetingId;
}

export function snapshotJobId(snapshotId: string): string {
  return snapshotId;
}
