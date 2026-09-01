import { describe, expect, it, vi, beforeEach } from "vitest";

const extractMeeting = vi.fn();
vi.mock("../../src/modules/ai/service.js", () => ({
  extractMeeting,
  generateFollowup: vi.fn(),
  generateRelationshipSummary: vi.fn().mockResolvedValue(undefined),
}));

const { isDbAvailable, createTenantWithUser, cleanupTenant } = await import("../fixtures/db.js");
const { prisma } = await import("../../src/db.js");
const { runMeetingPipeline } = await import("../../src/jobs/runMeetingPipeline.js");

const dbAvailable = await isDbAvailable();

async function makeMeeting(tenantId: string) {
  return prisma.meeting.create({
    data: {
      tenantId,
      zoomMeetingId: "1",
      zoomUuid: `uuid-${Date.now()}-${Math.random()}`,
      title: "t",
      participants: [],
      status: "PROCESSING",
    },
  });
}

describe.skipIf(!dbAvailable)("runMeetingPipeline — retries aren't defeated by the first failure", () => {
  beforeEach(() => {
    extractMeeting.mockReset();
  });

  it("does not mark the meeting FAILED itself when extraction throws — leaves status alone for BullMQ to retry", async () => {
    const { tenant } = await createTenantWithUser("retry1");
    const meeting = await makeMeeting(tenant.id);

    extractMeeting.mockRejectedValueOnce(new Error("OpenAI timeout"));
    await expect(runMeetingPipeline(meeting.id)).rejects.toThrow("OpenAI timeout");

    const afterFailure = await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } });
    // The old behavior called failMeeting here, which would make this "FAILED" — and once FAILED,
    // runMeetingPipeline's own first check returns early, so every subsequent BullMQ retry would
    // silently no-op instead of actually retrying.
    expect(afterFailure.status).toBe("PROCESSING");

    await cleanupTenant(tenant.id);
  });

  it("a retry after a transient failure actually re-attempts extraction and can succeed", async () => {
    const { tenant } = await createTenantWithUser("retry2");
    const meeting = await makeMeeting(tenant.id);

    extractMeeting.mockRejectedValueOnce(new Error("OpenAI timeout"));
    await expect(runMeetingPipeline(meeting.id)).rejects.toThrow();

    extractMeeting.mockResolvedValueOnce({
      summary: "s",
      conversationType: "SALES",
      decisions: [],
      actionItems: [],
      risks: [],
      openQuestions: [],
      nextSteps: [],
    });
    const { generateFollowup } = await import("../../src/modules/ai/service.js");
    vi.mocked(generateFollowup).mockResolvedValueOnce({
      subject: "s",
      body: "b",
      recipients: [],
      model: "gpt-4o-mini",
      promptVersion: "1",
      templateVersion: "1",
    } as any);

    const result = await runMeetingPipeline(meeting.id); // simulates BullMQ's next attempt

    expect(result.transcriptReady).toBe(true);
    const afterRetry = await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } });
    expect(afterRetry.status).toBe("AWAITING_APPROVAL"); // the retry actually completed the pipeline

    await cleanupTenant(tenant.id);
  });

  it("a meeting already FAILED (bounded retries exhausted) stays a no-op, not a fresh attempt", async () => {
    const { tenant } = await createTenantWithUser("retry3");
    const meeting = await makeMeeting(tenant.id);
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "FAILED" } });

    const result = await runMeetingPipeline(meeting.id);

    expect(result.transcriptReady).toBe(true);
    expect(extractMeeting).not.toHaveBeenCalled(); // never re-attempted — this is the correct terminal-state behavior

    await cleanupTenant(tenant.id);
  });
});
