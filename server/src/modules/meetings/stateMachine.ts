import { prisma } from "../../db.js";
import type { MeetingStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  CAPTURED: ["WAITING_FOR_TRANSCRIPT", "FAILED"],
  WAITING_FOR_TRANSCRIPT: ["TRANSCRIPT_READY", "FAILED"],
  TRANSCRIPT_READY: ["PROCESSING", "FAILED"],
  PROCESSING: ["EXTRACTED", "FAILED"],
  EXTRACTED: ["DRAFT_READY", "FAILED"],
  DRAFT_READY: ["AWAITING_APPROVAL", "FAILED"],
  AWAITING_APPROVAL: ["APPROVED", "FAILED"],
  APPROVED: ["SENDING", "FAILED"],
  SENDING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: ["WAITING_FOR_TRANSCRIPT", "PROCESSING"], // manual retry re-enters the pipeline
};

/**
 * Compare-and-swap transition: `UPDATE ... WHERE id = ? AND status = ?`.
 * If another worker already moved the meeting, count is 0 and this is a no-op
 * rather than clobbering newer state — no app-level lock needed.
 */
export async function transitionMeeting(
  meetingId: string,
  from: MeetingStatus,
  to: MeetingStatus,
  extra: { failureReason?: string | null } = {}
): Promise<boolean> {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal meeting transition: ${from} -> ${to}`);
  }
  const result = await prisma.meeting.updateMany({
    where: { id: meetingId, status: from },
    data: { status: to, failureReason: extra.failureReason ?? null },
  });
  return result.count === 1;
}

export async function failMeeting(meetingId: string, reason: string): Promise<void> {
  await prisma.meeting.updateMany({
    where: { id: meetingId, status: { notIn: ["COMPLETED", "FAILED"] } },
    data: { status: "FAILED", failureReason: reason },
  });
}
