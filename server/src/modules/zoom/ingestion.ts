import { prisma } from "../../db.js";
import { downloadTranscriptVtt, listMeetingRecordings, listPastMeetingParticipants } from "./client.js";
import { resolveAccountForMeeting } from "../knowledge/resolution.js";

interface ZoomMeetingEndedPayload {
  payload: {
    account_id: string;
    object: {
      uuid: string;
      id: number | string;
      host_id: string;
      host_email?: string;
      topic: string;
      start_time?: string;
      duration?: number;
    };
  };
}

interface ZoomParticipantJoinedPayload {
  payload: {
    account_id: string;
    object: {
      uuid: string;
      id: number | string;
      topic?: string;
      participant: { user_name?: string; email?: string };
    };
  };
}

/**
 * This Zoom plan doesn't expose the Report API (report:read:meeting_participant isn't
 * available), so participant emails are captured live from meeting.participant_joined
 * webhooks instead of a pull API call — fits the webhook-driven architecture better
 * anyway, and needs no extra OAuth scope, just the event subscription.
 * Email is only present if the participant is signed into a matching Zoom account or
 * registered for the meeting; anonymous/guest joins won't have one.
 */
export async function handleParticipantJoined(payload: ZoomParticipantJoinedPayload): Promise<void> {
  const obj = payload.payload.object;
  const email = obj.participant.email;
  if (!email) return; // nothing to record without an email

  const conn = await prisma.zoomConnection.findFirst({ where: { zoomAccountId: payload.payload.account_id } });
  if (!conn) return;

  const meeting = await prisma.meeting.upsert({
    where: { tenantId_zoomUuid: { tenantId: conn.tenantId, zoomUuid: obj.uuid } },
    create: {
      tenantId: conn.tenantId,
      zoomMeetingId: String(obj.id),
      zoomUuid: obj.uuid,
      title: obj.topic ?? "(meeting in progress)",
      participants: [],
      status: "CAPTURED",
    },
    update: {},
  });

  const existing = (meeting.participants as any as Array<{ name: string; email: string }>) ?? [];
  if (existing.some((p) => p.email === email)) return; // already recorded this join

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { participants: [...existing, { name: obj.participant.user_name ?? email, email }] },
  });
}

/** meeting.ended webhook -> normalized Meeting row (CAPTURED -> WAITING_FOR_TRANSCRIPT). Idempotent on (tenantId, zoomUuid). */
export async function handleMeetingEnded(payload: ZoomMeetingEndedPayload) {
  const obj = payload.payload.object;
  const conn = await prisma.zoomConnection.findFirst({ where: { zoomAccountId: payload.payload.account_id } });
  if (!conn) {
    console.warn("meeting.ended for unknown Zoom account_id", payload.payload.account_id);
    return null;
  }

  const existing = await prisma.meeting.findUnique({ where: { tenantId_zoomUuid: { tenantId: conn.tenantId, zoomUuid: obj.uuid } } });
  let participantJson = (existing?.participants as any as Array<{ name: string; email: string }>) ?? [];

  // Webhook capture (participant_joined) is primary; if it missed everyone (event not subscribed,
  // delivery dropped, etc.), backfill from the past-meeting-participants API before falling back to host-only.
  if (participantJson.length === 0) {
    const backfilled = await listPastMeetingParticipants(conn.tenantId, obj.uuid).catch(() => []);
    participantJson = backfilled.map((p) => ({ name: p.name, email: p.user_email }));
  }
  if (participantJson.length === 0 && obj.host_email) {
    participantJson = [{ name: "Host", email: obj.host_email }];
  }

  const meeting = await prisma.meeting.upsert({
    where: { tenantId_zoomUuid: { tenantId: conn.tenantId, zoomUuid: obj.uuid } },
    create: {
      tenantId: conn.tenantId,
      zoomMeetingId: String(obj.id),
      zoomUuid: obj.uuid,
      title: obj.topic,
      startTime: obj.start_time ? new Date(obj.start_time) : null,
      durationSec: obj.duration ? obj.duration * 60 : null,
      hostEmail: obj.host_email,
      participants: participantJson,
      status: "WAITING_FOR_TRANSCRIPT",
    },
    update: {
      title: obj.topic,
      startTime: obj.start_time ? new Date(obj.start_time) : null,
      durationSec: obj.duration ? obj.duration * 60 : null,
      hostEmail: obj.host_email,
      participants: participantJson,
      status: "WAITING_FOR_TRANSCRIPT",
    },
  });

  const resolution = await resolveAccountForMeeting(conn.tenantId, participantJson);
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      accountId: resolution.accountId,
      contactId: resolution.contactId,
      needsResolution: resolution.needsResolution,
    },
  });

  return meeting;
}

/** VTT -> [{speaker, start, end, text}]. Minimal parser for Zoom's standard VTT transcript export. */
export function parseVtt(raw: string): Array<{ speaker: string; start: string; end: string; text: string }> {
  const blocks = raw.replace(/\r\n/g, "\n").split(/\n\n+/).slice(1); // drop the leading "WEBVTT" block
  const segments: Array<{ speaker: string; start: string; end: string; text: string }> = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [start, end] = timeLine.split("-->").map((s) => s.trim());
    const textLine = lines[lines.indexOf(timeLine) + 1] ?? "";
    const match = textLine.match(/^([^:]{1,80}):\s*(.*)$/);
    segments.push({
      speaker: match ? match[1].trim() : "Unknown",
      start,
      end,
      text: match ? match[2].trim() : textLine.trim(),
    });
  }
  return segments;
}

/** Downloads + stores the transcript for a meeting whose recording is ready. Returns false if no transcript file is present yet. */
export async function ingestTranscriptIfAvailable(meetingId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  const recordings = await listMeetingRecordings(meeting.tenantId, meeting.zoomMeetingId);
  const transcriptFile = recordings?.recording_files.find((f) => f.file_type === "TRANSCRIPT" && f.status === "completed");
  if (!transcriptFile) return false;

  const raw = await downloadTranscriptVtt(meeting.tenantId, transcriptFile.download_url);
  const segments = parseVtt(raw);

  await prisma.transcript.upsert({
    where: { meetingId },
    create: { meetingId, rawVtt: raw, normalizedSegments: segments as any, status: "READY" },
    update: { rawVtt: raw, normalizedSegments: segments as any, status: "READY", version: { increment: 1 } },
  });

  return true;
}
