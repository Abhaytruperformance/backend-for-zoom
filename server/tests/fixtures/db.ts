import { prisma } from "../../src/db.js";

let cached: boolean | null = null;

/** DB-backed suites skip (not fail) when no Postgres is reachable, e.g. this sandbox without Docker. */
export async function isDbAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await prisma.$queryRaw`SELECT 1`;
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

export async function createTenantWithUser(namePrefix: string) {
  const tenant = await prisma.tenant.create({ data: { name: `${namePrefix}-tenant-${Date.now()}` } });
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email: `${namePrefix}-${Date.now()}@internal.test`, passwordHash: "x" },
  });
  return { tenant, user };
}

export async function cleanupTenant(tenantId: string) {
  // FK-safe deletion order (leaf tables first). Fine for test-only cleanup, not a general-purpose cascade.
  await prisma.emailSendAttempt.deleteMany({ where: { snapshot: { draft: { meeting: { tenantId } } } } });
  await prisma.approvalSnapshot.deleteMany({ where: { draft: { meeting: { tenantId } } } });
  await prisma.followupDraft.deleteMany({ where: { meeting: { tenantId } } });
  await prisma.actionItem.deleteMany({ where: { tenantId } });
  await prisma.decision.deleteMany({ where: { tenantId } });
  await prisma.meetingExtraction.deleteMany({ where: { meeting: { tenantId } } });
  await prisma.transcript.deleteMany({ where: { meeting: { tenantId } } });
  await prisma.meeting.deleteMany({ where: { tenantId } });
  await prisma.relationshipSummary.deleteMany({ where: { account: { tenantId } } });
  await prisma.contact.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.webhookEvent.deleteMany({ where: { tenantId } });
  await prisma.mailboxConnection.deleteMany({ where: { user: { tenantId } } });
  await prisma.zoomConnection.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
}
