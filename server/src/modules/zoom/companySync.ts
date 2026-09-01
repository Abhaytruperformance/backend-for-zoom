import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { listAccountUsers, listUserRecordingsS2S, downloadTranscriptVttS2S } from "./client.js";
import { upsertMeetingWithResolution, parseVtt } from "./ingestion.js";
import { transitionMeeting } from "../meetings/stateMachine.js";
import { processTranscriptQueue, meetingJobId } from "../../queue.js";

export interface CompanySyncResult {
  usersScanned: number;
  recordingsFound: number;
  meetingsQueued: number;
  failures: number;
}

/**
 * Company-wide sync via Server-to-Server OAuth: authenticates as the whole Zoom account
 * (config.ZOOM_S2S_ACCOUNT_ID), not any one user, and pulls every user's past meetings into
 * one dedicated tenant (config.ZOOM_S2S_SYNC_TENANT_ID) — no per-user Connect click involved.
 *
 * Deliberately separate from the per-tenant OAuth flow (zoom/ingestion.ts): that flow's
 * downstream pipeline fetches transcripts using the connecting tenant's own OAuth token, which
 * this sync tenant will never have. So this function downloads the transcript itself (via S2S)
 * and only hands off to the shared processTranscriptQueue once the meeting is already at
 * TRANSCRIPT_READY — skipping the OAuth-dependent ingest step entirely rather than fighting it.
 *
 * ponytail: a meeting whose transcript isn't ready yet is skipped, not queued for retry — since
 * this runs daily, tomorrow's run picks it up naturally (it won't exist in the DB yet, so it
 * isn't skipped by the dedup check). Simpler than building S2S-specific poll/retry machinery.
 *
 * Logging is deliberately structured but content-free: user email + counts only, never a
 * meeting topic, transcript text, or extracted client detail — those can be genuinely
 * sensitive, and this log's job is "what happened," not "what was discussed."
 */
export async function syncCompanyZoomAccount(): Promise<CompanySyncResult> {
  if (!config.ZOOM_S2S_ACCOUNT_ID || !config.ZOOM_S2S_CLIENT_ID || !config.ZOOM_S2S_CLIENT_SECRET || !config.ZOOM_S2S_SYNC_TENANT_ID) {
    return { usersScanned: 0, recordingsFound: 0, meetingsQueued: 0, failures: 0 }; // not configured — no-op, not an error
  }

  const tenantId = config.ZOOM_S2S_SYNC_TENANT_ID;
  const users = await listAccountUsers();
  console.log(`zoom company sync started — users scanned: ${users.length}`);

  let recordingsFound = 0;
  let meetingsQueued = 0;
  let failures = 0;

  for (const user of users) {
    const meetings = await listUserRecordingsS2S(user.id).catch(() => []);
    // Oldest first — applyExtractionToKnowledgeBase's supersession logic assumes meetings are
    // extracted in the order they actually happened (see listBackfillCandidates for the same reasoning).
    meetings.sort((a, b) => new Date(a.start_time ?? 0).getTime() - new Date(b.start_time ?? 0).getTime());

    let userQueued = 0;
    let userFailed = 0;

    for (const m of meetings) {
      try {
        const existing = await prisma.meeting.findUnique({ where: { tenantId_zoomUuid: { tenantId, zoomUuid: m.uuid } } });
        if (existing) continue;

        const transcriptFile = m.recording_files.find((f) => f.file_type === "TRANSCRIPT" && f.status === "completed");
        if (!transcriptFile) continue; // not ready yet — next day's run will see this meeting again

        const meeting = await upsertMeetingWithResolution(
          tenantId,
          {
            zoomMeetingId: String(m.id),
            zoomUuid: m.uuid,
            topic: m.topic,
            startTime: m.start_time,
            durationSec: m.duration ? m.duration * 60 : undefined,
            hostEmail: m.host_email ?? user.email,
          },
          m.host_email ? [{ name: user.email, email: m.host_email }] : []
        );

        const raw = await downloadTranscriptVttS2S(transcriptFile.download_url);
        const segments = parseVtt(raw);
        await prisma.transcript.upsert({
          where: { meetingId: meeting.id },
          create: { meetingId: meeting.id, rawVtt: raw, normalizedSegments: segments as any, status: "READY" },
          update: { rawVtt: raw, normalizedSegments: segments as any, status: "READY", version: { increment: 1 } },
        });
        await transitionMeeting(meeting.id, "WAITING_FOR_TRANSCRIPT", "TRANSCRIPT_READY");

        await processTranscriptQueue.add(
          "processTranscript",
          { meetingId: meeting.id, eventType: "zoom_company_sync" },
          { jobId: meetingJobId(meeting.id) }
        );
        userQueued++;
      } catch (err) {
        // One meeting failing (bad download, DB hiccup, etc.) shouldn't abort the rest of this
        // user's meetings or the rest of the account — log which meeting via its Zoom uuid
        // (an opaque id, not content) and move on.
        userFailed++;
        console.error(`zoom company sync: failed on meeting uuid=${m.uuid} for user=${user.email} — ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`zoom company sync: user=${user.email} recordings=${meetings.length} queued=${userQueued} failed=${userFailed}`);
    recordingsFound += meetings.length;
    meetingsQueued += userQueued;
    failures += userFailed;
  }

  console.log(
    `zoom company sync completed — usersScanned=${users.length} recordingsFound=${recordingsFound} meetingsQueued=${meetingsQueued} failures=${failures}`
  );
  return { usersScanned: users.length, recordingsFound, meetingsQueued, failures };
}
