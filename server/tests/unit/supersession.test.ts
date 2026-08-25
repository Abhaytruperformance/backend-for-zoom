import { describe, expect, it, vi } from "vitest";

// applyExtractionToKnowledgeBase calls generateRelationshipSummary (a real OpenAI call) whenever an
// account is linked — stub it so these DB-focused tests never hit the network or need an API key.
vi.mock("../../src/modules/ai/service.js", () => ({ generateRelationshipSummary: vi.fn().mockResolvedValue(undefined) }));

const { isDbAvailable, createTenantWithUser, cleanupTenant } = await import("../fixtures/db.js");
const { prisma } = await import("../../src/db.js");
const { applyExtractionToKnowledgeBase } = await import("../../src/modules/knowledge/relationship.js");
const { buildMeetingContext } = await import("../../src/modules/knowledge/context.js");

const dbAvailable = await isDbAvailable();

async function makeMeeting(tenantId: string, accountId: string) {
  return prisma.meeting.create({
    data: {
      tenantId,
      accountId,
      zoomMeetingId: "1",
      zoomUuid: `uuid-${Date.now()}-${Math.random()}`,
      title: "t",
      participants: [{ name: "Sarah", email: "sarah@client.test" }, { name: "John", email: "john@client.test" }],
      status: "PROCESSING",
    },
  });
}

function baseExtraction(overrides: Partial<Parameters<typeof applyExtractionToKnowledgeBase>[1]> = {}) {
  return {
    summary: "s",
    conversationType: "SALES" as const,
    decisions: [],
    actionItems: [],
    risks: [],
    openQuestions: [],
    nextSteps: [],
    ...overrides,
  };
}

describe.skipIf(!dbAvailable)("applyExtractionToKnowledgeBase — the two hard business rules", () => {
  it("Test 1: a REJECTED decision (not just CONFIRMED) supersedes a prior CONFIRMED one (current meeting wins)", async () => {
    const { tenant } = await createTenantWithUser("t1");
    const account = await prisma.account.create({ data: { tenantId: tenant.id, name: "Acc", domains: [], emails: [] } });
    const meeting1 = await makeMeeting(tenant.id, account.id);

    const ctx0 = await buildMeetingContext(tenant.id, account.id, meeting1.id);
    await applyExtractionToKnowledgeBase(
      meeting1,
      baseExtraction({ decisions: [{ description: "Client wants Feature A", status: "CONFIRMED", confidence: 1, evidence: { speaker: "Client", quote: "we want Feature A" } }] }),
      ctx0
    );

    const original = await prisma.decision.findFirstOrThrow({ where: { meetingId: meeting1.id } });
    expect(original.status).toBe("CONFIRMED");

    const meeting2 = await makeMeeting(tenant.id, account.id);
    const ctx1 = await buildMeetingContext(tenant.id, account.id, meeting2.id);
    expect(ctx1.supersessionCandidateDecisions.map((d) => d.id)).toContain(original.id);

    await applyExtractionToKnowledgeBase(
      meeting2,
      baseExtraction({
        decisions: [{ description: "Client rejected Feature A", status: "REJECTED", supersedesId: original.id, confidence: 1, evidence: { speaker: "Client", quote: "we no longer want Feature A" } }],
      }),
      ctx1
    );

    const [supersededOriginal, activeNow] = await Promise.all([
      prisma.decision.findUniqueOrThrow({ where: { id: original.id } }),
      prisma.decision.findFirstOrThrow({ where: { meetingId: meeting2.id } }),
    ]);
    expect(supersededOriginal.status).toBe("SUPERSEDED");
    expect(activeNow.supersedesId).toBe(original.id);

    // Current-state query (what the briefing/context layer reads) must not surface the superseded decision.
    const ctxAfter = await buildMeetingContext(tenant.id, account.id, "irrelevant");
    expect(ctxAfter.supersessionCandidateDecisions.map((d) => d.id)).not.toContain(original.id);
    expect(ctxAfter.supersessionCandidateDecisions.map((d) => d.id)).toContain(activeNow.id);

    await cleanupTenant(tenant.id);
  });

  it("Test 2: ownership change — a later meeting reassigning an open action item updates the current owner", async () => {
    const { tenant } = await createTenantWithUser("t2");
    const account = await prisma.account.create({ data: { tenantId: tenant.id, name: "Acc", domains: [], emails: [] } });
    const meeting1 = await makeMeeting(tenant.id, account.id);

    const ctx0 = await buildMeetingContext(tenant.id, account.id, meeting1.id);
    await applyExtractionToKnowledgeBase(
      meeting1,
      baseExtraction({
        actionItems: [{ description: "Send proposal", ownerDisplayName: "John", ownerEmail: "john@client.test", confidence: 1, evidence: { speaker: "John", quote: "I'll own the proposal" } }],
      }),
      ctx0
    );
    const originalItem = await prisma.actionItem.findFirstOrThrow({ where: { meetingId: meeting1.id } });
    expect(originalItem.status).toBe("OPEN");

    const meeting2 = await makeMeeting(tenant.id, account.id);
    const ctx1 = await buildMeetingContext(tenant.id, account.id, meeting2.id);
    expect(ctx1.openActionItems.map((a) => a.id)).toContain(originalItem.id);

    await applyExtractionToKnowledgeBase(
      meeting2,
      baseExtraction({
        actionItems: [{ description: "Send proposal", ownerDisplayName: "Sarah", ownerEmail: "sarah@client.test", supersedesId: originalItem.id, confidence: 1, evidence: { speaker: "Sarah", quote: "I'll take over the proposal" } }],
      }),
      ctx1
    );

    const [oldItem, newItem] = await Promise.all([
      prisma.actionItem.findUniqueOrThrow({ where: { id: originalItem.id } }),
      prisma.actionItem.findFirstOrThrow({ where: { meetingId: meeting2.id } }),
    ]);
    expect(oldItem.status).toBe("CANCELLED"); // no longer active — reassigned
    expect(newItem.ownerDisplayName).toBe("Sarah");
    expect(newItem.status).toBe("OPEN");

    const currentOpen = await buildMeetingContext(tenant.id, account.id, "irrelevant");
    expect(currentOpen.openActionItems.map((a) => a.ownerDisplayName)).toEqual(["Sarah"]);

    await cleanupTenant(tenant.id);
  });

  it("Test 3: a due-date change on the same commitment updates the current due date, not a duplicate", async () => {
    const { tenant } = await createTenantWithUser("t3");
    const account = await prisma.account.create({ data: { tenantId: tenant.id, name: "Acc", domains: [], emails: [] } });
    const meeting1 = await makeMeeting(tenant.id, account.id);

    const ctx0 = await buildMeetingContext(tenant.id, account.id, meeting1.id);
    await applyExtractionToKnowledgeBase(
      meeting1,
      baseExtraction({ actionItems: [{ description: "Proposal", ownerDisplayName: "John", ownerEmail: "john@client.test", dueDate: "2026-01-10", confidence: 1, evidence: { speaker: "John", quote: "due Friday" } }] }),
      ctx0
    );
    const originalItem = await prisma.actionItem.findFirstOrThrow({ where: { meetingId: meeting1.id } });

    const meeting2 = await makeMeeting(tenant.id, account.id);
    const ctx1 = await buildMeetingContext(tenant.id, account.id, meeting2.id);
    await applyExtractionToKnowledgeBase(
      meeting2,
      baseExtraction({ actionItems: [{ description: "Proposal", ownerDisplayName: "John", ownerEmail: "john@client.test", dueDate: "2026-01-13", supersedesId: originalItem.id, confidence: 1, evidence: { speaker: "John", quote: "moved to Monday" } }] }),
      ctx1
    );

    const currentOpen = await buildMeetingContext(tenant.id, account.id, "irrelevant");
    expect(currentOpen.openActionItems).toHaveLength(1); // one active commitment, not two
    expect(currentOpen.openActionItems[0].dueDate).toBe("2026-01-13");

    await cleanupTenant(tenant.id);
  });

  it("a TENTATIVE decision never supersedes a prior CONFIRMED one — both are visible, confirmed stays authoritative", async () => {
    const { tenant } = await createTenantWithUser("t-tentative");
    const account = await prisma.account.create({ data: { tenantId: tenant.id, name: "Acc", domains: [], emails: [] } });
    const meeting1 = await makeMeeting(tenant.id, account.id);
    const ctx0 = await buildMeetingContext(tenant.id, account.id, meeting1.id);
    await applyExtractionToKnowledgeBase(
      meeting1,
      baseExtraction({ decisions: [{ description: "Launch date Sept 15", status: "CONFIRMED", confidence: 1, evidence: { speaker: "Client", quote: "launch is Sept 15, confirmed" } }] }),
      ctx0
    );
    const confirmed = await prisma.decision.findFirstOrThrow({ where: { meetingId: meeting1.id } });

    const meeting2 = await makeMeeting(tenant.id, account.id);
    const ctx1 = await buildMeetingContext(tenant.id, account.id, meeting2.id);
    // The model proposes a TENTATIVE decision with supersedesId set — this must be REJECTED by validation
    // (only CONFIRMED may supersede), even though the id came from the supplied candidate list.
    await applyExtractionToKnowledgeBase(
      meeting2,
      baseExtraction({ decisions: [{ description: "Maybe Sept 30 instead", status: "TENTATIVE", supersedesId: confirmed.id, confidence: 0.4, evidence: { speaker: "Client", quote: "we might push to Sept 30, not sure yet" } }] }),
      ctx1
    );

    const stillConfirmed = await prisma.decision.findUniqueOrThrow({ where: { id: confirmed.id }, include: { supersededBy: true } });
    expect(stillConfirmed.status).toBe("CONFIRMED"); // untouched — a tentative mention cannot supersede it
    expect(stillConfirmed.supersededBy).toBeNull();

    const tentative = await prisma.decision.findFirstOrThrow({ where: { meetingId: meeting2.id } });
    expect(tentative.supersedesId).toBeNull(); // stored as its own row, not linked as a supersession

    await cleanupTenant(tenant.id);
  });
});
