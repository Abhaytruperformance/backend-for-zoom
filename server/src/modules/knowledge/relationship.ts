import { prisma } from "../../db.js";
import { writeAudit } from "../../lib/audit.js";
import type { MeetingExtractionOutput } from "../ai/schemas.js";
import type { MeetingContextPackage } from "./context.js";
import { generateRelationshipSummary } from "../ai/service.js";
import type { Meeting } from "@prisma/client";

interface OwnerResolution {
  ownerType: "INTERNAL" | "EXTERNAL";
  ownerUserId: string | null;
  ownerContactId: string | null;
  ownerEmail: string | null;
  ownerDisplayName: string;
}

async function resolveActionOwner(
  tenantId: string,
  participants: Array<{ name: string; email?: string }>,
  ai: { ownerDisplayName: string; ownerEmail?: string | null }
): Promise<OwnerResolution> {
  const email =
    ai.ownerEmail ?? participants.find((p) => p.name.toLowerCase() === ai.ownerDisplayName.toLowerCase())?.email ?? null;

  if (email) {
    const user = await prisma.user.findFirst({ where: { tenantId, email } });
    if (user) {
      return { ownerType: "INTERNAL", ownerUserId: user.id, ownerContactId: null, ownerEmail: email, ownerDisplayName: ai.ownerDisplayName };
    }
    const contact = await prisma.contact.findFirst({ where: { tenantId, email } });
    if (contact) {
      return { ownerType: "EXTERNAL", ownerUserId: null, ownerContactId: contact.id, ownerEmail: email, ownerDisplayName: ai.ownerDisplayName };
    }
  }
  return { ownerType: "EXTERNAL", ownerUserId: null, ownerContactId: null, ownerEmail: email, ownerDisplayName: ai.ownerDisplayName };
}

/**
 * Applies validated extraction output to the knowledge base: creates
 * Decision/ActionItem rows, re-validates every AI-proposed supersession
 * against current DB state before applying it, then (if an account is
 * linked) regenerates the relationship summary. The LLM proposed; this
 * function is the enforcement boundary.
 */
export async function applyExtractionToKnowledgeBase(
  meeting: Meeting,
  extraction: MeetingExtractionOutput,
  context: MeetingContextPackage
): Promise<void> {
  const tenantId = meeting.tenantId;
  const accountId = context.accountId;
  const decisionCandidateIds = new Set(context.supersessionCandidateDecisions.map((d) => d.id));
  const actionCandidateIds = new Set(context.openActionItems.map((a) => a.id));
  const usedDecisionTargets = new Set<string>();
  const usedActionTargets = new Set<string>();

  for (const d of extraction.decisions) {
    let supersedesId: string | null = null;

    if (d.supersedesId && accountId && decisionCandidateIds.has(d.supersedesId) && !usedDecisionTargets.has(d.supersedesId)) {
      // A decisive new statement (CONFIRMED or REJECTED) may supersede a prior CONFIRMED/PROPOSED/TENTATIVE
      // one — a rejection is just as final as a confirmation. A merely PROPOSED/TENTATIVE mention may never
      // supersede a CONFIRMED decision (that's the rule that keeps a tentative "maybe Sept 30" from
      // overwriting a confirmed "Sept 15").
      const target = await prisma.decision.findFirst({
        where: { id: d.supersedesId, tenantId, accountId, supersededBy: null, status: { in: ["CONFIRMED", "PROPOSED", "TENTATIVE"] } },
      });
      const isDecisive = d.status === "CONFIRMED" || d.status === "REJECTED";
      if (target && isDecisive) {
        supersedesId = target.id;
        usedDecisionTargets.add(target.id);
      } else if (d.supersedesId) {
        await writeAudit({
          tenantId,
          entityType: "Decision",
          entityId: d.supersedesId,
          action: "SUPERSESSION_PROPOSAL_REJECTED",
          metadata: { reason: !target ? "target not found/already superseded" : "only a decisive (CONFIRMED/REJECTED) status may supersede", proposedStatus: d.status },
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      const created = await tx.decision.create({
        data: {
          tenantId,
          meetingId: meeting.id,
          accountId,
          description: d.description,
          status: d.status,
          supersedesId,
          confidence: d.confidence,
          evidenceRef: d.evidence as any,
        },
      });
      if (supersedesId) {
        await tx.decision.update({ where: { id: supersedesId }, data: { status: "SUPERSEDED" } });
        await writeAudit({ tenantId, entityType: "Decision", entityId: created.id, action: "SUPERSEDES", metadata: { supersedesId } });
      }
    });
  }

  for (const a of extraction.actionItems) {
    let supersedesId: string | null = null;

    if (a.supersedesId && accountId && actionCandidateIds.has(a.supersedesId) && !usedActionTargets.has(a.supersedesId)) {
      const target = await prisma.actionItem.findFirst({
        where: { id: a.supersedesId, tenantId, accountId, supersededBy: null, status: "OPEN" },
      });
      if (target) {
        supersedesId = target.id;
        usedActionTargets.add(target.id);
      } else {
        await writeAudit({
          tenantId,
          entityType: "ActionItem",
          entityId: a.supersedesId,
          action: "SUPERSESSION_PROPOSAL_REJECTED",
          metadata: { reason: "target not found / not open / already superseded" },
        });
      }
    }

    const owner = await resolveActionOwner(tenantId, (meeting.participants as any) ?? [], a);

    await prisma.$transaction(async (tx) => {
      const created = await tx.actionItem.create({
        data: {
          tenantId,
          meetingId: meeting.id,
          accountId,
          description: a.description,
          ownerType: owner.ownerType,
          ownerUserId: owner.ownerUserId,
          ownerContactId: owner.ownerContactId,
          ownerEmail: owner.ownerEmail,
          ownerDisplayName: owner.ownerDisplayName,
          dueDate: a.dueDate ? new Date(a.dueDate) : null,
          priority: a.priority,
          status: "OPEN",
          confidence: a.confidence,
          evidenceRef: a.evidence as any,
          supersedesId,
        },
      });
      if (supersedesId) {
        await tx.actionItem.update({ where: { id: supersedesId }, data: { status: "CANCELLED" } });
        await writeAudit({ tenantId, entityType: "ActionItem", entityId: created.id, action: "SUPERSEDES", metadata: { supersedesId } });
      }
    });
  }

  if (accountId) {
    await prisma.account.update({ where: { id: accountId }, data: { lastMeetingAt: meeting.startTime ?? new Date() } });
    await generateRelationshipSummary(tenantId, accountId);
  }
}
