import { prisma } from "../../db.js";
import { writeAudit } from "../../lib/audit.js";
import { transitionMeeting } from "../meetings/stateMachine.js";
import { sendViaGmail, reconcileGmailSend } from "./gmail.js";
import { sendViaGraph, reconcileGraphSend } from "./graph.js";
import { markReauthRequired } from "./tokens.js";

const MAX_RECONCILIATION_ATTEMPTS = 5;

/**
 * Idempotent, reconciliation-aware send. Never fires a second send without
 * first checking whether the earlier attempt actually went through — a lost
 * HTTP response is not proof of failure.
 */
export async function sendApprovedEmail(snapshotId: string): Promise<void> {
  const attempt = await prisma.emailSendAttempt.findUnique({
    where: { snapshotId },
    include: { snapshot: { include: { draft: { include: { meeting: true } }, approvedByUser: true } } },
  });
  if (!attempt) throw new Error(`No EmailSendAttempt for snapshot ${snapshotId}`);
  if (attempt.status === "SENT") return; // already done — no-op, never a second send
  if (attempt.status === "AUTH_REQUIRED") return; // needs a human to reconnect the mailbox first

  const { snapshot } = attempt;
  const userId = snapshot.approvedByUserId;
  const tenantId = snapshot.draft.meeting.tenantId;
  const recipients = (snapshot.recipients as any as Array<{ email: string }>).map((r) => r.email);
  const fromEmail = snapshot.approvedByUser.email;

  const reconcile = attempt.provider === "GOOGLE" ? reconcileGmailSend : reconcileGraphSend;
  const send = attempt.provider === "GOOGLE"
    ? () => sendViaGmail({ userId, fromEmail, to: recipients, subject: snapshot.subject, body: snapshot.body, internetMessageId: attempt.internetMessageIdHeader })
    : () => sendViaGraph({ userId, to: recipients, subject: snapshot.subject, body: snapshot.body, internetMessageId: attempt.internetMessageIdHeader });

  // Any retry (attempts > 0, or we're explicitly in NEEDS_RECONCILIATION) checks the mailbox first.
  if (attempt.attempts > 0 || attempt.status === "NEEDS_RECONCILIATION") {
    if (attempt.attempts > MAX_RECONCILIATION_ATTEMPTS) {
      await prisma.emailSendAttempt.update({ where: { id: attempt.id }, data: { status: "NEEDS_RECONCILIATION" } });
      return; // give up on auto-reconciliation; surfaced in UI for a human decision
    }
    const found = await reconcile(userId, attempt.internetMessageIdHeader).catch(
      () => ({ found: false, providerMessageId: undefined }) as { found: boolean; providerMessageId?: string }
    );
    if (found.found) {
      await markSent(attempt.id, snapshot.draft.meetingId, tenantId, found.providerMessageId ?? null);
      return;
    }
  }

  try {
    const result = await send();
    await markSent(attempt.id, snapshot.draft.meetingId, tenantId, result.providerMessageId ?? null);
  } catch (err: any) {
    if (err.authFailure) {
      // getValidMailboxAccessToken already flips the connection to REAUTH_REQUIRED on refresh failure;
      // a 401 straight from the send call (valid token, revoked scope, etc.) needs the same explicit outcome here.
      const conn = await prisma.mailboxConnection.findUnique({ where: { userId_provider: { userId, provider: attempt.provider } } });
      if (conn) await markReauthRequired(conn.id, "401 on send");
      await prisma.emailSendAttempt.update({
        where: { id: attempt.id },
        data: { status: "AUTH_REQUIRED", attempts: { increment: 1 }, lastError: "mailbox authorization required" },
      });
      return; // not a BullMQ-retryable condition — a human has to reconnect first
    }

    await prisma.emailSendAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "NEEDS_RECONCILIATION",
        attempts: { increment: 1 },
        lastError: err instanceof Error ? err.message : "send failed",
        nextRetryAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    throw err; // let BullMQ's backoff schedule the next reconciliation-first attempt
  }
}

async function markSent(attemptId: string, meetingId: string, tenantId: string, providerMessageId: string | null): Promise<void> {
  await prisma.emailSendAttempt.update({
    where: { id: attemptId },
    data: { status: "SENT", providerMessageId, completedAt: new Date(), attempts: { increment: 1 } },
  });
  await transitionMeeting(meetingId, "SENDING", "COMPLETED");
  await writeAudit({ tenantId, entityType: "EmailSendAttempt", entityId: attemptId, action: "SENT" });
}
