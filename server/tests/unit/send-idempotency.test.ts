import { describe, expect, it, vi, beforeEach } from "vitest";

const sendViaGmail = vi.fn();
const reconcileGmailSend = vi.fn();

vi.mock("../../src/modules/mailbox/gmail.js", () => ({ sendViaGmail, reconcileGmailSend }));
vi.mock("../../src/modules/mailbox/tokens.js", () => ({ markReauthRequired: vi.fn(), getValidMailboxAccessToken: vi.fn(), markValidated: vi.fn() }));

const { isDbAvailable, createTenantWithUser, cleanupTenant } = await import("../fixtures/db.js");
const { prisma } = await import("../../src/db.js");
const { sendApprovedEmail } = await import("../../src/modules/mailbox/sender.js");

const dbAvailable = await isDbAvailable();

async function makeApprovedSnapshot(tenantId: string, userId: string) {
  const meeting = await prisma.meeting.create({
    data: { tenantId, zoomMeetingId: "1", zoomUuid: `uuid-${Date.now()}-${Math.random()}`, title: "t", participants: [], status: "SENDING" },
  });
  const draft = await prisma.followupDraft.create({
    data: { meetingId: meeting.id, subject: "Subject", body: "Body", recipients: [{ email: "client@x.test" }], status: "APPROVED", model: "gpt-4o-mini", modelVersion: "gpt-4o-mini", promptVersion: "1", templateVersion: "1" },
  });
  const snapshot = await prisma.approvalSnapshot.create({
    data: { draftId: draft.id, subject: "Subject", body: "Body", recipients: [{ email: "client@x.test" }], actionItems: [], approvedByUserId: userId, modelVersion: "1", promptVersion: "1", templateVersion: "1" },
  });
  const attempt = await prisma.emailSendAttempt.create({
    data: { snapshotId: snapshot.id, provider: "GOOGLE", status: "PENDING", internetMessageIdHeader: `${snapshot.id}@zri.local` },
  });
  return { meeting, snapshot, attempt };
}

describe.skipIf(!dbAvailable)("sendApprovedEmail — Test 7: a lost/ambiguous provider response never causes a duplicate send", () => {
  beforeEach(() => {
    sendViaGmail.mockReset();
    reconcileGmailSend.mockReset();
  });

  it("marks NEEDS_RECONCILIATION on an ambiguous failure instead of assuming success or silently retrying", async () => {
    const { tenant, user } = await createTenantWithUser("send1");
    const { snapshot, attempt } = await makeApprovedSnapshot(tenant.id, user.id);

    sendViaGmail.mockRejectedValueOnce(Object.assign(new Error("timeout"), { ambiguous: true }));
    await expect(sendApprovedEmail(snapshot.id)).rejects.toThrow();

    const after = await prisma.emailSendAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe("NEEDS_RECONCILIATION");
    expect(sendViaGmail).toHaveBeenCalledTimes(1);

    await cleanupTenant(tenant.id);
  });

  it("on retry, checks the mailbox for the message before ever sending again — finds it, marks SENT, never calls send twice", async () => {
    const { tenant, user } = await createTenantWithUser("send2");
    const { snapshot, attempt } = await makeApprovedSnapshot(tenant.id, user.id);

    sendViaGmail.mockRejectedValueOnce(Object.assign(new Error("timeout"), { ambiguous: true }));
    await expect(sendApprovedEmail(snapshot.id)).rejects.toThrow();

    reconcileGmailSend.mockResolvedValueOnce({ status: "found", providerMessageId: "gmail-123" });
    await sendApprovedEmail(snapshot.id);

    expect(sendViaGmail).toHaveBeenCalledTimes(1); // still just the one original attempt — retry never re-sent
    expect(reconcileGmailSend).toHaveBeenCalledTimes(1);

    const after = await prisma.emailSendAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe("SENT");
    expect(after.providerMessageId).toBe("gmail-123");

    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: (await prisma.followupDraft.findUniqueOrThrow({ where: { id: snapshot.draftId } })).meetingId } });
    expect(meeting.status).toBe("COMPLETED");

    await cleanupTenant(tenant.id);
  });

  it("once SENT, calling sendApprovedEmail again is a pure no-op — never touches the send or reconcile functions", async () => {
    const { tenant, user } = await createTenantWithUser("send3");
    const { snapshot, attempt } = await makeApprovedSnapshot(tenant.id, user.id);
    await prisma.emailSendAttempt.update({ where: { id: attempt.id }, data: { status: "SENT", attempts: 1 } });

    await sendApprovedEmail(snapshot.id);

    expect(sendViaGmail).not.toHaveBeenCalled();
    expect(reconcileGmailSend).not.toHaveBeenCalled();

    await cleanupTenant(tenant.id);
  });

  it("refuses to re-send when reconciliation cannot determine whether the first attempt landed", async () => {
    const { tenant, user } = await createTenantWithUser("send4");
    const { snapshot, attempt } = await makeApprovedSnapshot(tenant.id, user.id);

    sendViaGmail.mockRejectedValueOnce(Object.assign(new Error("timeout"), { ambiguous: true }));
    await expect(sendApprovedEmail(snapshot.id)).rejects.toThrow();

    // The provider errors on the lookup — we genuinely do not know if the message went out.
    // Previously this collapsed to "not found" and the retry sent a second copy to the client.
    reconcileGmailSend.mockResolvedValueOnce({ status: "unknown", reason: "SENT list failed: 403" });
    await sendApprovedEmail(snapshot.id);

    expect(sendViaGmail).toHaveBeenCalledTimes(1); // crucially NOT 2
    const after = await prisma.emailSendAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe("NEEDS_RECONCILIATION");
    expect(after.lastError).toContain("could not verify previous send");

    await cleanupTenant(tenant.id);
  });

  it("does re-send when reconciliation positively confirms the message is absent", async () => {
    const { tenant, user } = await createTenantWithUser("send5");
    const { snapshot, attempt } = await makeApprovedSnapshot(tenant.id, user.id);

    sendViaGmail.mockRejectedValueOnce(Object.assign(new Error("timeout"), { ambiguous: true }));
    await expect(sendApprovedEmail(snapshot.id)).rejects.toThrow();

    reconcileGmailSend.mockResolvedValueOnce({ status: "not_found" });
    sendViaGmail.mockResolvedValueOnce({ providerMessageId: "gmail-456" });
    await sendApprovedEmail(snapshot.id);

    expect(sendViaGmail).toHaveBeenCalledTimes(2); // the retry is correct here
    const after = await prisma.emailSendAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe("SENT");

    await cleanupTenant(tenant.id);
  });
});
