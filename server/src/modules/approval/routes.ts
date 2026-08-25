import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { assertTenantOwns } from "../../lib/tenantScope.js";
import { writeAudit } from "../../lib/audit.js";
import { generateFollowup } from "../ai/service.js";
import { transitionMeeting } from "../meetings/stateMachine.js";
import { sendEmailQueue, snapshotJobId } from "../../queue.js";
import { config } from "../../config.js";

export const approvalRouter = Router();
approvalRouter.use(requireAuth);

approvalRouter.get(
  "/:meetingId",
  asyncRoute(async (req, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.meetingId },
      include: {
        extraction: true,
        decisions: true,
        actionItems: true,
        followupDraft: {
          include: {
            approvalSnapshot: {
              include: { sendAttempt: true, approvedByUser: { select: { name: true, email: true } } },
            },
          },
        },
        account: { include: { relationshipSummaries: { orderBy: { generatedAt: "desc" }, take: 1 } } },
      },
    });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);
    res.json(meeting);
  })
);

const draftUpdateSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
  recipients: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).optional(),
  tonePreset: z.string().optional(),
});

approvalRouter.patch("/:meetingId/draft", async (req, res, next) => {
  try {
    const body = draftUpdateSchema.parse(req.body);
    const draft = await prisma.followupDraft.findUnique({ where: { meetingId: req.params.meetingId }, include: { meeting: true } });
    if (!draft) throw Object.assign(new Error("Draft not found"), { status: 404 });
    assertTenantOwns("Meeting", draft.meeting, req.user!.tenantId);
    if (draft.status === "APPROVED") throw Object.assign(new Error("Cannot edit an approved draft"), { status: 409 });

    const updated = await prisma.followupDraft.update({
      where: { id: draft.id },
      data: { subject: body.subject, body: body.body, recipients: body.recipients as any, tonePreset: body.tonePreset },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

approvalRouter.post("/:meetingId/regenerate", async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.meetingId }, include: { followupDraft: true } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);
    if (meeting.followupDraft?.status === "APPROVED") {
      throw Object.assign(new Error("Cannot regenerate an approved draft"), { status: 409 });
    }

    const tonePreset = (req.body?.tonePreset as string) ?? meeting.followupDraft?.tonePreset ?? "client-formal";
    const generated = await generateFollowup(meeting.id, tonePreset);

    const draft = await prisma.followupDraft.upsert({
      where: { meetingId: meeting.id },
      create: {
        meetingId: meeting.id,
        subject: generated.subject,
        body: generated.body,
        recipients: generated.recipients as any,
        tonePreset,
        status: "DRAFT",
        model: generated.model,
        modelVersion: generated.model,
        promptVersion: generated.promptVersion,
        templateVersion: generated.templateVersion,
      },
      update: {
        subject: generated.subject,
        body: generated.body,
        recipients: generated.recipients as any,
        tonePreset,
        model: generated.model,
        modelVersion: generated.model,
        promptVersion: generated.promptVersion,
        templateVersion: generated.templateVersion,
      },
    });
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

approvalRouter.post("/:meetingId/reject", async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.meetingId }, include: { followupDraft: true } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);
    if (!meeting.followupDraft) throw Object.assign(new Error("Draft not found"), { status: 404 });

    await prisma.followupDraft.update({ where: { id: meeting.followupDraft.id }, data: { status: "REJECTED" } });
    await writeAudit({ tenantId: req.user!.tenantId, actorUserId: req.user!.userId, entityType: "FollowupDraft", entityId: meeting.followupDraft.id, action: "REJECTED" });
    res.json({ rejected: true });
  } catch (err) {
    next(err);
  }
});

const approveSchema = z.object({
  recipients: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  mailboxProvider: z.enum(["GOOGLE", "MICROSOFT"]),
});

approvalRouter.post("/:meetingId/approve", async (req, res, next) => {
  try {
    const payload = approveSchema.parse(req.body);
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.meetingId },
      include: { followupDraft: true, actionItems: true },
    });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);
    if (!meeting.followupDraft) throw Object.assign(new Error("Draft not found"), { status: 404 });
    if (meeting.followupDraft.status === "APPROVED") throw Object.assign(new Error("Already approved"), { status: 409 });
    if (meeting.status !== "AWAITING_APPROVAL") throw Object.assign(new Error(`Meeting is not awaiting approval (status: ${meeting.status})`), { status: 409 });

    const mailbox = await prisma.mailboxConnection.findUnique({
      where: { userId_provider: { userId: req.user!.userId, provider: payload.mailboxProvider } },
    });
    if (!mailbox || mailbox.status !== "ACTIVE") {
      throw Object.assign(new Error(`Connect and activate your ${payload.mailboxProvider} mailbox before approving a send`), { status: 409 });
    }

    const { snapshot } = await prisma.$transaction(async (tx) => {
      await tx.followupDraft.update({ where: { id: meeting.followupDraft!.id }, data: { status: "APPROVED" } });

      const snapshot = await tx.approvalSnapshot.create({
        data: {
          draftId: meeting.followupDraft!.id,
          subject: payload.subject,
          body: payload.body,
          recipients: payload.recipients as any,
          actionItems: meeting.actionItems as any,
          approvedByUserId: req.user!.userId,
          modelVersion: meeting.followupDraft!.modelVersion,
          promptVersion: meeting.followupDraft!.promptVersion,
          templateVersion: meeting.followupDraft!.templateVersion,
        },
      });

      await tx.emailSendAttempt.create({
        data: {
          snapshotId: snapshot.id,
          provider: payload.mailboxProvider,
          status: "PENDING",
          internetMessageIdHeader: `${snapshot.id}@${config.OUTBOUND_MESSAGE_ID_DOMAIN}`,
        },
      });

      return { snapshot };
    });

    await transitionMeeting(meeting.id, "AWAITING_APPROVAL", "APPROVED");
    await transitionMeeting(meeting.id, "APPROVED", "SENDING");
    await writeAudit({ tenantId: req.user!.tenantId, actorUserId: req.user!.userId, entityType: "ApprovalSnapshot", entityId: snapshot.id, action: "APPROVED" });

    await sendEmailQueue.add("sendEmail", { snapshotId: snapshot.id }, { jobId: snapshotJobId(snapshot.id) });

    res.json({ approved: true, snapshotId: snapshot.id });
  } catch (err) {
    next(err);
  }
});
