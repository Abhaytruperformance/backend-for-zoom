import { Worker } from "bullmq";
import { redisConnection, QUEUE_NAMES, pollTranscriptQueue, zoomCompanySyncQueue, meetingJobId } from "../queue.js";
import { runMeetingPipeline } from "./runMeetingPipeline.js";
import { failMeeting } from "../modules/meetings/stateMachine.js";
import { sendApprovedEmail } from "../modules/mailbox/sender.js";
import { syncCompanyZoomAccount } from "../modules/zoom/companySync.js";
import { sendAlert } from "../lib/alert.js";

const processTranscriptWorker = new Worker(
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

// Only mark FAILED once BullMQ itself confirms every configured attempt is exhausted — doing
// this any earlier (e.g. inside runMeetingPipeline on the very first failure) would make every
// subsequent retry a silent no-op, defeating the attempts/backoff config entirely.
processTranscriptWorker.on("failed", async (job, error) => {
  if (!job) return;
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await failMeeting(job.data.meetingId as string, error?.message ?? "processing failed after bounded retries");
  }
});

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

pollWorker.on("failed", async (job, error) => {
  if (!job) return;
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    // error.message is whichever actually happened — "transcript not yet available" on the
    // common path, but a real extraction/knowledge-base error otherwise; the old hardcoded
    // "transcript not available" message was wrong for that second case.
    await failMeeting(job.data.meetingId as string, error?.message ?? "failed after bounded retries");
  }
});

new Worker(
  QUEUE_NAMES.SEND_EMAIL,
  async (job) => {
    await sendApprovedEmail(job.data.snapshotId as string);
  },
  { connection: redisConnection }
);

new Worker(
  QUEUE_NAMES.ZOOM_COMPANY_SYNC,
  // syncCompanyZoomAccount already logs its own per-user + summary lines. Per-meeting
  // failures are visible there; a total failure of the run itself (token expired, scope
  // revoked, the whole account fetch throwing) previously only showed up as a log line no
  // one was watching — this runs once a day, so it's worth flagging same-day, not after a streak.
  async () => {
    try {
      await syncCompanyZoomAccount();
    } catch (err) {
      await sendAlert(`Zoom company sync failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err; // still fails the BullMQ job — alerting is additive, not a substitute for that record
    }
  },
  { connection: redisConnection }
);

// Daily at 03:00 UTC. Re-adding the same repeat config on every boot is a no-op if it already
// exists — BullMQ dedupes repeatable jobs by their pattern, not by call count.
await zoomCompanySyncQueue.add("zoomCompanySync", {}, { repeat: { pattern: "0 3 * * *" } });

console.log("workers started");
