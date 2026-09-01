import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock only the external boundaries: the Zoom client (network) and the job queue (Redis).
// upsertMeetingWithResolution, parseVtt, and transitionMeeting run for real against the test DB —
// the point is to verify companySync.ts's own branching, not re-mock everything it calls.
const listAccountUsers = vi.fn();
const listUserRecordingsS2S = vi.fn();
const downloadTranscriptVttS2S = vi.fn();
vi.mock("../../src/modules/zoom/client.js", () => ({ listAccountUsers, listUserRecordingsS2S, downloadTranscriptVttS2S }));

const queueAdd = vi.fn();
vi.mock("../../src/queue.js", () => ({
  processTranscriptQueue: { add: queueAdd },
  meetingJobId: (id: string) => id,
}));

// config is a plain object export — mutate ZOOM_S2S_SYNC_TENANT_ID per test rather than re-mocking.
vi.mock("../../src/config.js", () => ({
  config: {
    ZOOM_S2S_ACCOUNT_ID: "test-account",
    ZOOM_S2S_CLIENT_ID: "test-client",
    ZOOM_S2S_CLIENT_SECRET: "test-secret",
    ZOOM_S2S_SYNC_TENANT_ID: "",
  },
}));

const { isDbAvailable, createTenantWithUser, cleanupTenant } = await import("../fixtures/db.js");
const { prisma } = await import("../../src/db.js");
const { config } = await import("../../src/config.js");
const { syncCompanyZoomAccount } = await import("../../src/modules/zoom/companySync.js");

const dbAvailable = await isDbAvailable();

const VALID_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
Speaker: Hello.
`;

function recordedMeeting(overrides: Partial<{ uuid: string; id: number; topic: string; hasTranscript: boolean }> = {}) {
  const { uuid = `uuid-${Date.now()}-${Math.random()}`, id = 1, topic = "Test Meeting", hasTranscript = true } = overrides;
  return {
    uuid,
    id,
    topic,
    start_time: "2026-01-01T10:00:00Z",
    duration: 30,
    host_email: "host@company.test",
    recording_files: hasTranscript
      ? [{ id: "f1", file_type: "TRANSCRIPT", status: "completed", download_url: "https://zoom.example/transcript.vtt" }]
      : [{ id: "f1", file_type: "MP4", status: "completed", download_url: "https://zoom.example/video.mp4" }],
  };
}

describe.skipIf(!dbAvailable)("syncCompanyZoomAccount", () => {
  beforeEach(() => {
    listAccountUsers.mockReset();
    listUserRecordingsS2S.mockReset();
    downloadTranscriptVttS2S.mockReset();
    queueAdd.mockReset();
    config.ZOOM_S2S_SYNC_TENANT_ID = "";
  });

  it("no-ops without throwing when S2S env vars aren't configured", async () => {
    // ZOOM_S2S_SYNC_TENANT_ID left empty (default from the mock above).
    const result = await syncCompanyZoomAccount();
    expect(result).toEqual({ usersScanned: 0, recordingsFound: 0, meetingsQueued: 0, failures: 0 });
    expect(listAccountUsers).not.toHaveBeenCalled();
  });

  it("skips a meeting that's already in the database — no duplicate row, no requeue", async () => {
    const { tenant } = await createTenantWithUser("cs-existing");
    config.ZOOM_S2S_SYNC_TENANT_ID = tenant.id;

    const m = recordedMeeting();
    await prisma.meeting.create({
      data: { tenantId: tenant.id, zoomMeetingId: String(m.id), zoomUuid: m.uuid, title: m.topic, participants: [], status: "AWAITING_APPROVAL" },
    });

    listAccountUsers.mockResolvedValue([{ id: "u1", email: "user@company.test" }]);
    listUserRecordingsS2S.mockResolvedValue([m]);

    const result = await syncCompanyZoomAccount();

    expect(result.meetingsQueued).toBe(0);
    expect(queueAdd).not.toHaveBeenCalled();
    const rows = await prisma.meeting.findMany({ where: { tenantId: tenant.id, zoomUuid: m.uuid } });
    expect(rows).toHaveLength(1); // still just the one — not duplicated

    await cleanupTenant(tenant.id);
  });

  it("skips a recording with no completed transcript file — nothing created, next day's run will retry", async () => {
    const { tenant } = await createTenantWithUser("cs-notranscript");
    config.ZOOM_S2S_SYNC_TENANT_ID = tenant.id;

    const m = recordedMeeting({ hasTranscript: false });
    listAccountUsers.mockResolvedValue([{ id: "u1", email: "user@company.test" }]);
    listUserRecordingsS2S.mockResolvedValue([m]);

    const result = await syncCompanyZoomAccount();

    expect(result).toEqual({ usersScanned: 1, recordingsFound: 1, meetingsQueued: 0, failures: 0 });
    expect(downloadTranscriptVttS2S).not.toHaveBeenCalled();
    const rows = await prisma.meeting.findMany({ where: { tenantId: tenant.id, zoomUuid: m.uuid } });
    expect(rows).toHaveLength(0); // no dangling row for a meeting we can't process yet

    await cleanupTenant(tenant.id);
  });

  it("processes a new recording end to end: meeting + transcript created, queued, TRANSCRIPT_READY", async () => {
    const { tenant } = await createTenantWithUser("cs-new");
    config.ZOOM_S2S_SYNC_TENANT_ID = tenant.id;

    const m = recordedMeeting();
    listAccountUsers.mockResolvedValue([{ id: "u1", email: "user@company.test" }]);
    listUserRecordingsS2S.mockResolvedValue([m]);
    downloadTranscriptVttS2S.mockResolvedValue(VALID_VTT);

    const result = await syncCompanyZoomAccount();

    expect(result).toEqual({ usersScanned: 1, recordingsFound: 1, meetingsQueued: 1, failures: 0 });
    expect(listUserRecordingsS2S).toHaveBeenCalledWith("u1"); // confirms the recordings-list contract, not previous_meetings

    const meeting = await prisma.meeting.findFirstOrThrow({ where: { tenantId: tenant.id, zoomUuid: m.uuid } });
    expect(meeting.status).toBe("TRANSCRIPT_READY");
    const transcript = await prisma.transcript.findUnique({ where: { meetingId: meeting.id } });
    expect(transcript?.status).toBe("READY");
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith("processTranscript", { meetingId: meeting.id, eventType: "zoom_company_sync" }, { jobId: meeting.id });

    await cleanupTenant(tenant.id);
  });

  it("one meeting failing doesn't stop the rest — failure is counted, other meetings still process", async () => {
    const { tenant } = await createTenantWithUser("cs-partial-fail");
    config.ZOOM_S2S_SYNC_TENANT_ID = tenant.id;

    const bad = recordedMeeting({ topic: "Bad meeting" });
    const good = recordedMeeting({ topic: "Good meeting" });
    listAccountUsers.mockResolvedValue([{ id: "u1", email: "user@company.test" }]);
    listUserRecordingsS2S.mockResolvedValue([bad, good]);
    downloadTranscriptVttS2S.mockRejectedValueOnce(new Error("download failed")).mockResolvedValueOnce(VALID_VTT);

    const result = await syncCompanyZoomAccount();

    expect(result.meetingsQueued).toBe(1);
    expect(result.failures).toBe(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);

    const goodMeeting = await prisma.meeting.findFirstOrThrow({ where: { tenantId: tenant.id, zoomUuid: good.uuid } });
    expect(goodMeeting.status).toBe("TRANSCRIPT_READY");

    await cleanupTenant(tenant.id);
  });

  it("a user with zero recordings produces a clean zero result, not a failure", async () => {
    const { tenant } = await createTenantWithUser("cs-zero");
    config.ZOOM_S2S_SYNC_TENANT_ID = tenant.id;

    listAccountUsers.mockResolvedValue([{ id: "u1", email: "empty@company.test" }]);
    listUserRecordingsS2S.mockResolvedValue([]);

    const result = await syncCompanyZoomAccount();

    expect(result).toEqual({ usersScanned: 1, recordingsFound: 0, meetingsQueued: 0, failures: 0 });

    await cleanupTenant(tenant.id);
  });
});
