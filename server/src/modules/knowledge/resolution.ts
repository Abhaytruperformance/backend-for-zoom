import { prisma } from "../../db.js";

export interface ResolutionResult {
  accountId: string | null;
  contactId: string | null;
  needsResolution: boolean;
}

/**
 * 100% deterministic identity resolution — no LLM involvement.
 * Order: exact contact email -> exact account email -> account domain -> ambiguous.
 * Zero matches: meeting proceeds unlinked. Multiple distinct accounts matched:
 * flagged for human resolution rather than silently picking one.
 */
export async function resolveAccountForMeeting(
  tenantId: string,
  participants: Array<{ name: string; email?: string }>
): Promise<ResolutionResult> {
  const emails = [...new Set(participants.map((p) => p.email).filter((e): e is string => !!e))];
  if (emails.length === 0) {
    return { accountId: null, contactId: null, needsResolution: false };
  }

  const contacts = await prisma.contact.findMany({ where: { tenantId, email: { in: emails } } });
  let matchedAccountIds = new Set(contacts.filter((c) => c.accountId).map((c) => c.accountId as string));

  if (matchedAccountIds.size === 0) {
    const domains = [...new Set(emails.map((e) => e.split("@")[1]).filter(Boolean))];
    const [accountsByEmail, accountsByDomain] = await Promise.all([
      prisma.account.findMany({ where: { tenantId, emails: { hasSome: emails } } }),
      prisma.account.findMany({ where: { tenantId, domains: { hasSome: domains } } }),
    ]);
    matchedAccountIds = new Set([...accountsByEmail, ...accountsByDomain].map((a) => a.id));
  }

  if (matchedAccountIds.size === 0) {
    return { accountId: null, contactId: null, needsResolution: false };
  }
  if (matchedAccountIds.size > 1) {
    return { accountId: null, contactId: null, needsResolution: true };
  }

  const accountId = [...matchedAccountIds][0];
  const contact = contacts.find((c) => c.accountId === accountId) ?? null;
  return { accountId, contactId: contact?.id ?? null, needsResolution: false };
}
