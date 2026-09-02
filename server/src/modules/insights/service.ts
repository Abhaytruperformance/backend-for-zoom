import { prisma } from "../../db.js";

export async function computeInsights(tenantId: string) {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [statusCountsThisMonth, meetingsLastMonth, approvedSnapshots, staleActionItems] = await Promise.all([
    prisma.meeting.groupBy({
      by: ["status"],
      where: { tenantId, startTime: { gte: startOfThisMonth } },
      _count: true,
    }),
    prisma.meeting.count({ where: { tenantId, startTime: { gte: startOfLastMonth, lt: startOfThisMonth } } }),
    prisma.approvalSnapshot.findMany({
      where: { draft: { meeting: { tenantId } }, approvedAt: { gte: last30Days } },
      select: { approvedAt: true, draft: { select: { createdAt: true } } },
    }),
    prisma.actionItem.findMany({
      where: { tenantId, status: "OPEN", dueDate: { lt: now }, accountId: { not: null } },
      select: { accountId: true, account: { select: { name: true } } },
    }),
  ]);

  const meetingsThisMonth = statusCountsThisMonth.reduce((sum, s) => sum + s._count, 0);
  const statusBreakdown = Object.fromEntries(statusCountsThisMonth.map((s) => [s.status, s._count]));

  const turnaroundHours = approvedSnapshots.map((s) => (s.approvedAt.getTime() - s.draft.createdAt.getTime()) / (1000 * 60 * 60));
  const avgApprovalTurnaroundHours = turnaroundHours.length ? turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length : null;

  const staleByAccount = new Map<string, { accountName: string; overdueCount: number }>();
  for (const item of staleActionItems) {
    if (!item.accountId || !item.account) continue;
    const existing = staleByAccount.get(item.accountId);
    if (existing) existing.overdueCount++;
    else staleByAccount.set(item.accountId, { accountName: item.account.name, overdueCount: 1 });
  }
  const staleAccounts = [...staleByAccount.entries()]
    .map(([accountId, v]) => ({ accountId, ...v }))
    .sort((a, b) => b.overdueCount - a.overdueCount);

  return {
    meetingsThisMonth,
    meetingsLastMonth,
    statusBreakdown,
    approvalsCount30d: approvedSnapshots.length,
    avgApprovalTurnaroundHours,
    staleAccounts,
  };
}
