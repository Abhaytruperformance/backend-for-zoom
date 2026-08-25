import { prisma } from "../db.js";
import { ingestTranscriptIfAvailable } from "../modules/zoom/ingestion.js";
import { transitionMeeting, failMeeting } from "../modules/meetings/stateMachine.js";
import { buildMeetingContext } from "../modules/knowledge/context.js";
import { extractMeeting, generateFollowup } from "../modules/ai/service.js";
import { applyExtractionToKnowledgeBase } from "../modules/knowledge/relationship.js";

/**
 * Full pipeline from "transcript might be ready" through "draft awaiting
 * approval". Called by both the webhook-triggered processTranscript job and
 * the bounded fallback poll job — idempotent via the CAS state machine, so
 * either path (or both racing) converges to the same result.
 */
export async function runMeetingPipeline(meetingId: string): Promise<{ transcriptReady: boolean }> {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });

  if (meeting.status === "COMPLETED" || meeting.status === "FAILED") {
    return { transcriptReady: true };
  }

  if (meeting.status === "CAPTURED" || meeting.status === "WAITING_FOR_TRANSCRIPT") {
    const available = await ingestTranscriptIfAvailable(meetingId);
    if (!available) return { transcriptReady: false };
    await transitionMeeting(meetingId, meeting.status, "TRANSCRIPT_READY");
  }

  try {
    const current = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    if (current.status === "TRANSCRIPT_READY") {
      await transitionMeeting(meetingId, "TRANSCRIPT_READY", "PROCESSING");
    }

    const afterProcessing = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    if (afterProcessing.status === "PROCESSING") {
      const context = await buildMeetingContext(afterProcessing.tenantId, afterProcessing.accountId, meetingId);
      const extraction = await extractMeeting(meetingId, context);
      await applyExtractionToKnowledgeBase(afterProcessing, extraction, context);
      await transitionMeeting(meetingId, "PROCESSING", "EXTRACTED");
    }

    const afterExtracted = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    if (afterExtracted.status === "EXTRACTED") {
      const draft = await generateFollowup(meetingId, "client-formal");
      await prisma.followupDraft.create({
        data: {
          meetingId,
          subject: draft.subject,
          body: draft.body,
          recipients: draft.recipients as any,
          tonePreset: "client-formal",
          status: "DRAFT",
          model: draft.model,
          modelVersion: draft.model,
          promptVersion: draft.promptVersion,
          templateVersion: draft.templateVersion,
        },
      });
      await transitionMeeting(meetingId, "EXTRACTED", "DRAFT_READY");
      await transitionMeeting(meetingId, "DRAFT_READY", "AWAITING_APPROVAL");
    }
  } catch (err) {
    await failMeeting(meetingId, err instanceof Error ? err.message : "Unknown processing error");
    throw err;
  }

  return { transcriptReady: true };
}
