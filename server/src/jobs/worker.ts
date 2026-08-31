import { Worker } from "bullmq";
import { redisConnection, QUEUE_NAMES, pollTranscriptQueue, meetingJobId } from "../queue.js";
import { runMeetingPipeline } from "./runMeetingPipeline.js";
import { failMeeting } from "../modules/meetings/stateMachine.js";
import { sendApprovedEmail } from "../modules/mailbox/sender.js";

new Worker(
  QUEUE_NAMES.PROCESS_TRANSCRIPT,
  async (job) => {
    const result = await runMeetingPipeline(job.data.meetingId as string);
    if (!result.transcriptReady) return; // nothing ingested — leave the poll job as the only thing still driving this meeting
    // Transcript is in — the fallback poll for this meeting is no longer needed.
    const pending = await pollTranscriptQueue.getJob(meetingJobId(job.data.meetingId as string));
    if (pending) await pending.remove().catch(() => {});
  },
  { connection: redisConnection }
);

const pollWorker = new Worker(
  QUEUE_NAMES.POLL_TRANSCRIPT,
  async (job) => {
    const result = await runMeetingPipeline(job.data.meetingId as string);
    if (!result.transcriptReady) {
      throw new Error("transcript not yet available"); // triggers BullMQ's bounded backoff retry
    }
  },
  { connection: redisConnection }
);

pollWorker.on("failed", async (job) => {
  if (!job) return;
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await failMeeting(job.data.meetingId as string, "transcript not available for this recording after bounded retries");
  }
});

new Worker(
  QUEUE_NAMES.SEND_EMAIL,
  async (job) => {
    await sendApprovedEmail(job.data.snapshotId as string);
  },
  { connection: redisConnection }
);

console.log("workers started");
