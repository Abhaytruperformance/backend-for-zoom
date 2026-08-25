import { prisma } from "../../db.js";

// Explicit context budget — never unbounded history. Tune here, nowhere else.
export const MAX_OPEN_ACTION_ITEMS = 20;
export const MAX_RECENT_MEETINGS = 5;
export const MAX_RECENT_DECISIONS = 10;
export const RELATIONSHIP_SUMMARY_MAX_CHARS = 2000;

export interface MeetingContextPackage {
  accountId: string | null;
  accountName: string | null;
  relationshipSummary: string | null;
  openActionItems: Array<{ id: string; description: string; ownerDisplayName: string; dueDate: string | null }>;
  supersessionCandidateDecisions: Array<{ id: string; description: string; status: string }>;
  recentMeetings: Array<{ id: string; title: string; date: string | null; oneLineSummary: string | null }>;
}

/** Bounded context retrieval — this is what gets recorded verbatim into MeetingExtraction.contextUsed. */
export async function buildMeetingContext(tenantId: string, accountId: string | null, currentMeetingId: string): Promise<MeetingContextPackage> {
  if (!accountId) {
    return {
      accountId: null,
      accountName: null,
      relationshipSummary: null,
      openActionItems: [],
      supersessionCandidateDecisions: [],
      recentMeetings: [],
    };
  }

  const [account, latestSummary, openActionItems, candidateDecisions, recentMeetings] = await Promise.all([
    prisma.account.findUnique({ where: { id: accountId } }),
    prisma.relationshipSummary.findFirst({ where: { accountId }, orderBy: { generatedAt: "desc" } }),
    prisma.actionItem.findMany({
      where: { tenantId, accountId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: MAX_OPEN_ACTION_ITEMS,
    }),
    prisma.decision.findMany({
      // REJECTED is included here too — a future meeting can un-reject a decision (a decisive status
      // may supersede any prior non-superseded decisive/tentative one, in either direction).
      where: { tenantId, accountId, status: { in: ["CONFIRMED", "PROPOSED", "TENTATIVE", "REJECTED"] }, supersededBy: null },
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_DECISIONS,
    }),
    prisma.meeting.findMany({
      where: { tenantId, accountId, id: { not: currentMeetingId }, status: { in: ["COMPLETED", "DRAFT_READY", "AWAITING_APPROVAL", "APPROVED"] } },
      orderBy: { startTime: "desc" },
      take: MAX_RECENT_MEETINGS,
      include: { extraction: true },
    }),
  ]);

  return {
    accountId,
    accountName: account?.name ?? null,
    relationshipSummary: latestSummary?.content.slice(0, RELATIONSHIP_SUMMARY_MAX_CHARS) ?? null,
    openActionItems: openActionItems.map((a) => ({
      id: a.id,
      description: a.description,
      ownerDisplayName: a.ownerDisplayName,
      dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
    })),
    supersessionCandidateDecisions: candidateDecisions.map((d) => ({ id: d.id, description: d.description, status: d.status })),
    recentMeetings: recentMeetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.startTime?.toISOString().slice(0, 10) ?? null,
      oneLineSummary: m.extraction?.summary?.slice(0, 200) ?? null,
    })),
  };
}
