import { describe, expect, it } from "vitest";
import { isDbAvailable, createTenantWithUser, cleanupTenant } from "../fixtures/db.js";
import { prisma } from "../../src/db.js";
import { computeInsights } from "../../src/modules/insights/service.js";

const dbAvailable = await isDbAvailable();

async function makeMeeting(tenantId: string, opts: { status: string; startTime: Date; accountId?: string }) {
  return prisma.meeting.create({
    data: {
      tenantId,
      zoomMeetingId: "1",
      zoomUuid: `uuid-${Date.now()}-${Math.random()}`,
      title: "t",
      participants: [],
      status: opts.status as any,
      startTime: opts.startTime,
      accountId: opts.accountId,
    },
  });
}

describe.skipIf(!dbAvailable)("computeInsights", () => {
  it("counts this month's meetings by status, ignoring meetings from other months and other tenants", async () => {
    const { tenant } = await createTenantWithUser("insights1");
    const { tenant: otherTenant } = await createTenantWithUser("insights1-other");
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 5);

    await makeMeeting(tenant.id, { status: "COMPLETED", startTime: thisMonth });
    await makeMeeting(tenant.id, { status: "COMPLETED", startTime: thisMonth });
    await makeMeeting(tenant.id, { status: "FAILED", startTime: thisMonth });
    await makeMeeting(tenant.id, { status: "COMPLETED", startTime: lastMonth }); // last month — excluded from this-month count
    await makeMeeting(otherTenant.id, { status: "COMPLETED", startTime: thisMonth }); // other tenant — must not leak in

    const result = await computeInsights(tenant.id);

    expect(result.meetingsThisMonth).toBe(3);
    expect(result.statusBreakdown.COMPLETED).toBe(2);
    expect(result.statusBreakdown.FAILED).toBe(1);
    expect(result.meetingsLastMonth).toBe(1);

    await cleanupTenant(tenant.id);
    await cleanupTenant(otherTenant.id);
  });

  it("computes average approval turnaround from real draft-creation to approval timestamps", async () => {
    const { tenant, user } = await createTenantWithUser("insights2");
    const meeting = await makeMeeting(tenant.id, { status: "COMPLETED", startTime: new Date() });

    const draftCreatedAt = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4h before approval
    const draft = await prisma.followupDraft.create({
      data: {
        meetingId: meeting.id,
        subject: "s",
        body: "b",
        recipients: [],
        status: "APPROVED",
        model: "gpt-4o-mini",
        modelVersion: "gpt-4o-mini",
        promptVersion: "1",
        templateVersion: "1",
        createdAt: draftCreatedAt,
      },
    });
    await prisma.approvalSnapshot.create({
      data: {
        draftId: draft.id,
        subject: "s",
        body: "b",
        recipients: [],
        actionItems: [],
        approvedByUserId: user.id,
        modelVersion: "1",
        promptVersion: "1",
        templateVersion: "1",
        approvedAt: new Date(), // now — 4h after draftCreatedAt
      },
    });

    const result = await computeInsights(tenant.id);

    expect(result.approvalsCount30d).toBe(1);
    expect(result.avgApprovalTurnaroundHours).not.toBeNull();
    expect(result.avgApprovalTurnaroundHours!).toBeGreaterThan(3.9);
    expect(result.avgApprovalTurnaroundHours!).toBeLessThan(4.1);

    await cleanupTenant(tenant.id);
  });

  it("groups overdue OPEN action items by account, sorted by overdue count descending", async () => {
    const { tenant } = await createTenantWithUser("insights3");
    const accountA = await prisma.account.create({ data: { tenantId: tenant.id, name: "Acme", domains: [], emails: [] } });
    const accountB = await prisma.account.create({ data: { tenantId: tenant.id, name: "Beta", domains: [], emails: [] } });
    const meeting = await makeMeeting(tenant.id, { status: "COMPLETED", startTime: new Date() });
    const overdue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.actionItem.createMany({
      data: [
        { tenantId: tenant.id, meetingId: meeting.id, accountId: accountA.id, description: "a1", ownerDisplayName: "x", status: "OPEN", dueDate: overdue },
        { tenantId: tenant.id, meetingId: meeting.id, accountId: accountA.id, description: "a2", ownerDisplayName: "x", status: "OPEN", dueDate: overdue },
        { tenantId: tenant.id, meetingId: meeting.id, accountId: accountB.id, description: "b1", ownerDisplayName: "x", status: "OPEN", dueDate: overdue },
        { tenantId: tenant.id, meetingId: meeting.id, accountId: accountB.id, description: "b2", ownerDisplayName: "x", status: "OPEN", dueDate: future }, // not overdue — excluded
        { tenantId: tenant.id, meetingId: meeting.id, accountId: accountA.id, description: "a3", ownerDisplayName: "x", status: "COMPLETED", dueDate: overdue }, // not OPEN — excluded
      ],
    });

    const result = await computeInsights(tenant.id);

    expect(result.staleAccounts).toEqual([
      { accountId: accountA.id, accountName: "Acme", overdueCount: 2 },
      { accountId: accountB.id, accountName: "Beta", overdueCount: 1 },
    ]);

    await cleanupTenant(tenant.id);
  });
});

describe.skipIf(!dbAvailable)("bulk action item update — tenant isolation", () => {
  it("only updates action items belonging to the requesting tenant, even when other tenants' ids are included", async () => {
    const { tenant } = await createTenantWithUser("bulk1");
    const { tenant: otherTenant } = await createTenantWithUser("bulk1-other");
    const meeting = await makeMeeting(tenant.id, { status: "COMPLETED", startTime: new Date() });
    const otherMeeting = await makeMeeting(otherTenant.id, { status: "COMPLETED", startTime: new Date() });

    const mine = await prisma.actionItem.create({
      data: { tenantId: tenant.id, meetingId: meeting.id, description: "mine", ownerDisplayName: "x", status: "OPEN" },
    });
    const theirs = await prisma.actionItem.create({
      data: { tenantId: otherTenant.id, meetingId: otherMeeting.id, description: "theirs", ownerDisplayName: "x", status: "OPEN" },
    });

    // Exactly the query shape the /actions/bulk route runs.
    const result = await prisma.actionItem.updateMany({
      where: { id: { in: [mine.id, theirs.id] }, tenantId: tenant.id },
      data: { status: "COMPLETED" },
    });

    expect(result.count).toBe(1);
    expect((await prisma.actionItem.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("COMPLETED");
    expect((await prisma.actionItem.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("OPEN"); // untouched

    await cleanupTenant(tenant.id);
    await cleanupTenant(otherTenant.id);
  });
});
